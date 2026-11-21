import { Types, type ClientSession } from "mongoose";
import { CategorieDepense, type ICategorieDepense } from "@/models/categorieDepense";
import { Depense, type IDepense } from "@/models/depense";
import { MouvementCaisse } from "@/models/mouvementCaisse";
import { Kiosque } from "@/models/kiosque";
import { Notification } from "@/models/notification";
import { JournalActivite } from "@/models/journalActivite";
import { Sequence } from "@/models/sequence";
import { nextNumero } from "@/lib/numero";
import { exigerKiosque, kiosquesAutorises } from "@/lib/tenant";
import { avecTransaction } from "@/lib/transaction";
import { sessionActive } from "@/services/caisses.service";
import type { CurrentUser } from "@/lib/auth";
import type { CategorieDepenseDTO, DepenseDTO } from "@/types/depenses";

/**
 * Service métier dépenses — sorties d'argent du tiroir-caisse.
 *
 * RÈGLES :
 * - Enregistrement réservé à l'action `enregistrer_depense` (le vendeur ne
 *   l'obtient que si le propriétaire l'ajoute à son profil).
 * - Une dépense matérialise une sortie réelle d'espèces : elle exige une
 *   session de caisse ouverte sur le kiosque et crée immédiatement un
 *   mouvement de sortie `depense` (solde théorique à jour).
 * - Une dépense validée n'est JAMAIS modifiée ni supprimée. L'annulation
 *   (`annuler_depense`, vendeur exclu) exige un motif, conserve l'opération
 *   et produit un mouvement compensateur d'entrée `annulation_depense`.
 * - Idempotence par `idempotencyKey` unique par entreprise.
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

function nomComplet(u: { nom?: string; prenom?: string }) {
  return [u.prenom, u.nom].filter(Boolean).join(" ").trim() || "Utilisateur";
}

function errHttp(message: string, status = 400, code?: string): never {
  const e: any = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

// --------------------------- Catégories ---------------------------

async function codeSuivant(eid: Types.ObjectId) {
  const seq = await Sequence.findOneAndUpdate(
    { entrepriseId: eid, kiosqueId: null, cle: "code_categorie_depense" },
    { $inc: { valeur: 1 } },
    { upsert: true, new: true }
  ).lean();
  return `CD${String(seq?.valeur || 1).padStart(3, "0")}`;
}

function catVersDTO(c: ICategorieDepense | any): CategorieDepenseDTO {
  return {
    _id: String(c._id),
    code: c.code,
    designation: c.designation,
    statut: c.statut,
  };
}

export async function listerCategoriesDepenses(
  user: CurrentUser,
  inclureInactives = false
): Promise<CategorieDepenseDTO[]> {
  const filtre: any = { entrepriseId: oid(user.entrepriseId!) };
  if (!inclureInactives) filtre.statut = "actif";
  const docs = await CategorieDepense.find(filtre).sort({ designation: 1 }).lean();
  return docs.map(catVersDTO);
}

export async function creerCategorieDepense(
  user: CurrentUser,
  data: { designation: string }
): Promise<CategorieDepenseDTO> {
  const eid = oid(user.entrepriseId!);
  let doc: any = null;
  for (let i = 0; i < 5; i++) {
    const code = await codeSuivant(eid);
    try {
      doc = await CategorieDepense.create({
        entrepriseId: eid,
        code,
        designation: data.designation,
        statut: "actif",
      });
      break;
    } catch (e: any) {
      if (e?.code === 11000 && i < 4) continue;
      throw e;
    }
  }
  await JournalActivite.create({
    entrepriseId: eid,
    userId: oid(user._id),
    action: "categorie_depense_creee",
    module: "depenses",
    details: { code: doc.code, designation: data.designation },
  });
  return catVersDTO(doc);
}

export async function modifierCategorieDepense(
  user: CurrentUser,
  id: string,
  data: { designation?: string; statut?: "actif" | "inactif" }
): Promise<CategorieDepenseDTO> {
  const eid = oid(user.entrepriseId!);
  const doc = await CategorieDepense.findOne({ _id: oid(id), entrepriseId: eid });
  if (!doc) errHttp("Catégorie introuvable.", 404, "INTROUVABLE");
  const avant = { designation: doc.designation, statut: doc.statut };
  if (data.designation !== undefined) doc.designation = data.designation;
  if (data.statut !== undefined) doc.statut = data.statut;
  await doc.save();
  await JournalActivite.create({
    entrepriseId: eid,
    userId: oid(user._id),
    action: "categorie_depense_modifiee",
    module: "depenses",
    details: { code: doc.code, avant, apres: { designation: doc.designation, statut: doc.statut } },
  });
  return catVersDTO(doc);
}

// --------------------------- Dépenses ---------------------------

function depenseVersDTO(
  d: IDepense | any,
  kiosqueNom?: string,
  categorieNom?: string | null
): DepenseDTO {
  return {
    _id: String(d._id),
    numero: d.numero,
    kiosqueId: String(d.kiosqueId),
    kiosqueNom,
    categorieDepenseId: d.categorieDepenseId ? String(d.categorieDepenseId) : null,
    categorieNom: categorieNom ?? null,
    montant: d.montant,
    motif: d.motif || undefined,
    dateDepense: d.dateDepense?.toISOString?.() || String(d.dateDepense),
    statut: d.statut,
    creeParNom: d.creeParNom,
    annulation: d.annulation?.annuleeLe
      ? {
          motif: d.annulation.motif,
          annuleeLe: d.annulation.annuleeLe?.toISOString?.() || String(d.annulation.annuleeLe),
          annuleeParNom: d.annulation.annuleeParNom,
        }
      : undefined,
    createdAt: d.createdAt?.toISOString?.() || undefined,
  };
}

/**
 * Enregistrement d'une dépense — action `enregistrer_depense`.
 * Exige une caisse ouverte : la dépense sort immédiatement du tiroir.
 */
export async function enregistrerDepense(
  user: CurrentUser,
  data: {
    kiosqueId: string;
    categorieDepenseId?: string | null;
    montant: number;
    motif?: string;
    dateDepense?: string;
    idempotencyKey: string;
  }
): Promise<{ depense: DepenseDTO; dupliquee: boolean }> {
  const eid = oid(user.entrepriseId!);

  const existante = await Depense.findOne({
    entrepriseId: eid,
    idempotencyKey: data.idempotencyKey,
  }).lean();
  if (existante) {
    return { depense: await depenseCompleteDTO(existante as any), dupliquee: true };
  }

  const kiosque = await exigerKiosque(user, data.kiosqueId);
  if (kiosque.statut === "inactif") {
    errHttp("Ce kiosque est désactivé.", 400, "KIOSQUE_INACTIF");
  }

  let categorie: any = null;
  if (data.categorieDepenseId) {
    if (!Types.ObjectId.isValid(data.categorieDepenseId)) {
      errHttp("Catégorie de dépense invalide.", 400, "CATEGORIE_INVALIDE");
    }
    categorie = await CategorieDepense.findOne({
      _id: oid(data.categorieDepenseId),
      entrepriseId: eid,
    }).lean();
    if (!categorie) errHttp("Catégorie de dépense introuvable.", 404, "CATEGORIE_INVALIDE");
    if (categorie.statut === "inactif") {
      errHttp("Cette catégorie de dépense est désactivée.", 400, "CATEGORIE_INACTIVE");
    }
  }

  const session = await sessionActive(eid, kiosque._id);
  if (!session) {
    errHttp(
      "Aucune caisse ouverte sur ce kiosque — ouvrez la caisse avant d'enregistrer une dépense.",
      400,
      "CAISSE_FERMEE"
    );
  }

  const nom = nomComplet(user);
  const dateDepense = data.dateDepense ? new Date(data.dateDepense) : new Date();
  if (isNaN(dateDepense.getTime())) {
    errHttp("Date de dépense invalide.", 400, "DATE_INVALIDE");
  }

  let depenseId: Types.ObjectId | null = null;
  let numero = "";
  try {
    await avecTransaction(async (tx) => {
      numero = await nextNumero(eid, "depense", `DEP-${kiosque.code}`, {
        kiosqueId: kiosque._id,
        session: tx,
      });
      const [dep] = await Depense.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            categorieDepenseId: categorie?._id || null,
            sessionCaisseId: session._id,
            numero,
            montant: data.montant,
            motif: data.motif || undefined,
            dateDepense,
            statut: "validee",
            creeParId: oid(user._id),
            creeParNom: nom,
            idempotencyKey: data.idempotencyKey,
          },
        ],
        { session: tx }
      );
      depenseId = dep._id;
      await MouvementCaisse.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            sessionCaisseId: session._id,
            type: "sortie",
            motif: "depense",
            montant: data.montant,
            modePaiement: "Espèces",
            depenseId: dep._id,
            userId: oid(user._id),
            userNom: nom,
            date: dateDepense,
          },
        ],
        { session: tx }
      );
    });
  } catch (e: any) {
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      const deja = await Depense.findOne({
        entrepriseId: eid,
        idempotencyKey: data.idempotencyKey,
      }).lean();
      if (deja) {
        return { depense: await depenseCompleteDTO(deja as any), dupliquee: true };
      }
    }
    throw e;
  }

  await Notification.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    type: "depense",
    titre: `Dépense enregistrée — ${numero}`,
    message: `${kiosque.designation} · ${nom} — ${categorie?.designation || "Divers"} — ${data.montant} FCFA${data.motif ? ` — ${data.motif}` : ""}`,
    montant: data.montant,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "depense_enregistree",
    module: "depenses",
    details: {
      numero,
      montant: data.montant,
      categorie: categorie?.designation || null,
      motif: data.motif || null,
    },
  });

  const dep = await Depense.findById(depenseId).lean();
  return { depense: depenseVersDTO(dep, kiosque.designation, categorie?.designation), dupliquee: false };
}

/**
 * Annulation d'une dépense validée — action `annuler_depense`.
 * Motif obligatoire, dépense conservée, mouvement compensateur d'entrée.
 */
export async function annulerDepense(
  user: CurrentUser,
  id: string,
  motif: string
): Promise<DepenseDTO> {
  const eid = oid(user.entrepriseId!);
  if (!Types.ObjectId.isValid(id)) errHttp("Dépense introuvable.", 404, "INTROUVABLE");
  const depense = await Depense.findOne({ _id: oid(id), entrepriseId: eid });
  if (!depense) errHttp("Dépense introuvable.", 404, "INTROUVABLE");
  if (depense.statut === "annulee") {
    errHttp("Cette dépense est déjà annulée.", 409, "DEJA_ANNULEE");
  }
  const kiosque = await Kiosque.findById(depense.kiosqueId).lean();
  const nom = nomComplet(user);
  let maj: any = null;

  await avecTransaction(async (tx) => {
    const verrouillee = await Depense.findOneAndUpdate(
      { _id: depense._id, entrepriseId: eid, statut: "validee" },
      {
        $set: {
          statut: "annulee",
          annulation: {
            motif,
            annuleeLe: new Date(),
            annuleeParId: oid(user._id),
            annuleeParNom: nom,
          },
        },
      },
      { new: true, session: tx ?? null }
    );
    if (!verrouillee) {
      errHttp("Cette dépense est déjà annulée.", 409, "DEJA_ANNULEE");
    }
    maj = verrouillee;
    // Compensation : l'argent annulé rentre dans la caisse active du kiosque.
    const session = await sessionActive(eid, depense.kiosqueId, tx);
    await MouvementCaisse.create(
      [
        {
          entrepriseId: eid,
          kiosqueId: depense.kiosqueId,
          sessionCaisseId: session?._id || null,
          type: "entree",
          motif: "annulation_depense",
          montant: depense.montant,
          modePaiement: "Espèces",
          depenseId: depense._id,
          userId: oid(user._id),
          userNom: nom,
          date: new Date(),
        },
      ],
      { session: tx }
    );
  });

  await Notification.create({
    entrepriseId: eid,
    kiosqueId: depense.kiosqueId,
    type: "depense",
    titre: `Dépense annulée — ${depense.numero}`,
    message: `${kiosque?.designation || ""} · ${nom} a annulé la dépense ${depense.numero} (${depense.montant} FCFA) — Motif : ${motif}`,
    montant: depense.montant,
    vendeurId: oid(user._id),
    vendeurNom: nom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: depense.kiosqueId,
    userId: oid(user._id),
    action: "depense_annulee",
    module: "depenses",
    details: {
      numero: depense.numero,
      avant: { statut: "validee", montant: depense.montant, motif: depense.motif || null },
      apres: { statut: "annulee" },
      motifAnnulation: motif,
    },
  });

  return depenseCompleteDTO(maj?.toObject?.() || maj);
}

async function depenseCompleteDTO(d: any): Promise<DepenseDTO> {
  const [k, c] = await Promise.all([
    Kiosque.findById(d.kiosqueId).select("designation").lean(),
    d.categorieDepenseId
      ? CategorieDepense.findById(d.categorieDepenseId).select("designation").lean()
      : null,
  ]);
  return depenseVersDTO(d, k?.designation, c?.designation);
}

/** Liste des dépenses — portée : contrôleurs = kiosques autorisés ;
 *  opérateurs (vendeur/caissier avec `enregistrer_depense`) = leurs dépenses. */
export async function listerDepenses(
  user: CurrentUser,
  f: {
    kiosqueId?: string;
    categorieDepenseId?: string;
    statut?: string;
    du?: string;
    au?: string;
    q?: string;
    propresSeulement?: boolean;
    page?: number;
    limit?: number;
  }
) {
  const eid = oid(user.entrepriseId!);
  const kiosques = await kiosquesAutorises(user);
  const filtre: any = { entrepriseId: eid, kiosqueId: { $in: kiosques.map((k) => k._id) } };
  if (f.propresSeulement) filtre.creeParId = oid(user._id);
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    filtre.kiosqueId = oid(f.kiosqueId);
  }
  if (f.categorieDepenseId && Types.ObjectId.isValid(f.categorieDepenseId)) {
    filtre.categorieDepenseId = oid(f.categorieDepenseId);
  }
  if (f.statut && ["validee", "annulee"].includes(f.statut)) {
    filtre.statut = f.statut;
  }
  if (f.du || f.au) {
    filtre.dateDepense = {};
    if (f.du) filtre.dateDepense.$gte = new Date(f.du);
    if (f.au) filtre.dateDepense.$lte = new Date(`${f.au}T23:59:59.999Z`);
  }
  if (f.q) {
    const rx = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtre.$or = [{ numero: rx }, { motif: rx }, { creeParNom: rx }];
  }
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const [total, docs] = await Promise.all([
    Depense.countDocuments(filtre),
    Depense.find(filtre)
      .sort({ dateDepense: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  const kiosquesMap = new Map(
    (await Kiosque.find({ entrepriseId: eid }).select("designation").lean()).map((k) => [
      String(k._id),
      k.designation,
    ])
  );
  const catsMap = new Map(
    (await CategorieDepense.find({ entrepriseId: eid }).select("designation").lean()).map((c) => [
      String(c._id),
      c.designation,
    ])
  );
  const totalValidees = await Depense.aggregate([
    { $match: { ...filtre, statut: "validee" } },
    { $group: { _id: null, total: { $sum: "$montant" } } },
  ]);
  return {
    items: docs.map((d) =>
      depenseVersDTO(
        d,
        kiosquesMap.get(String(d.kiosqueId)),
        d.categorieDepenseId ? catsMap.get(String(d.categorieDepenseId)) : null
      )
    ),
    total,
    totalValidees: totalValidees[0]?.total || 0,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function detailDepense(user: CurrentUser, id: string): Promise<DepenseDTO> {
  const eid = oid(user.entrepriseId!);
  if (!Types.ObjectId.isValid(id)) errHttp("Dépense introuvable.", 404, "INTROUVABLE");
  const d = await Depense.findOne({ _id: oid(id), entrepriseId: eid }).lean();
  if (!d) errHttp("Dépense introuvable.", 404, "INTROUVABLE");
  return depenseCompleteDTO(d);
}
