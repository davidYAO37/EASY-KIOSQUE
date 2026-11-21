import { Types } from "mongoose";
import { Vente } from "@/models/vente";
import { LigneVente } from "@/models/ligneVente";
import { Paiement } from "@/models/paiement";
import { Creance } from "@/models/creance";
import { Client } from "@/models/client";
import { Produit } from "@/models/produit";
import { Kiosque } from "@/models/kiosque";
import { Entreprise } from "@/models/entreprise";
import { Notification } from "@/models/notification";
import { MouvementCaisse } from "@/models/mouvementCaisse";
import { JournalActivite } from "@/models/journalActivite";
import { nextNumero } from "@/lib/numero";
import { exigerKiosque, kiosqueAccessible } from "@/lib/tenant";
import { prixPourKiosque } from "./catalogue.service";
import { sessionActive } from "./caisses.service";
import { avecTransaction } from "@/lib/transaction";
import type { CurrentUser } from "@/lib/auth";
import type {
  ListeVentes,
  TicketVente,
  VenteDTO,
} from "@/types/ventes";

/**
 * Service métier ventes — cœur du POS.
 *
 * RÈGLES INALTÉRABLES (cahier des charges renforcé) :
 * - Les prix sont TOUJOURS re-lus depuis MongoDB (tarif officiel, surcharge
 *   kiosque incluse) ; aucun prix envoyé par le navigateur n'est accepté.
 * - Aucune remise en V1 (le schéma Zod strict rejette tout champ inconnu).
 * - Idempotence : une vente n'est jamais validée deux fois.
 * - Pas de suppression physique : l'annulation est tracée (motif, auteur,
 *   date) et l'opération initiale est conservée.
 * - Notification propriétaire créée APRÈS commit effectif en base.
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

// ----------------------------- Lecture -----------------------------

export interface FiltresVentes {
  q?: string;
  kiosqueId?: string;
  vendeurId?: string;
  clientId?: string;
  statut?: string;
  typeVente?: string;
  du?: string;
  au?: string;
  page?: number;
  limit?: number;
}

/** Portée des ventes visibles selon le rôle (propriétaire = tout). */
function porteeVentes(user: CurrentUser, filtre: any) {
  const voitTout = ["admin", "gestionnaire", "comptable"].includes(user.type);
  if (voitTout) return;
  if (user.type === "responsable") {
    // Restreint aux kiosques affectés (vide = tous les kiosques du tenant)
    if (user.kiosqueIds?.length) {
      filtre.kiosqueId = { $in: user.kiosqueIds.map(oid) };
    }
    return;
  }
  // caissier, vendeur et autres : uniquement leurs propres ventes
  filtre.vendeurId = oid(user._id);
}

function filtreVentes(user: CurrentUser, f: FiltresVentes) {
  const filtre: any = { entrepriseId: oid(user.entrepriseId!) };
  porteeVentes(user, filtre);

  if (f.q) {
    const r = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtre.numeroVente = r;
  }
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    const kid = oid(f.kiosqueId);
    filtre.kiosqueId = filtre.kiosqueId?.$in
      ? { $in: filtre.kiosqueId.$in.filter((k: Types.ObjectId) => k.equals(kid)) }
      : kid;
  }
  if (f.vendeurId && Types.ObjectId.isValid(f.vendeurId)) {
    filtre.vendeurId = filtre.vendeurId || oid(f.vendeurId);
  }
  if (f.clientId && Types.ObjectId.isValid(f.clientId)) {
    filtre.clientId = oid(f.clientId);
  }
  if (f.statut === "validee" || f.statut === "annulee") {
    filtre.statutVente = f.statut;
  }
  if (f.typeVente === "comptant" || f.typeVente === "credit") {
    filtre.typeVente = f.typeVente;
  }
  if (f.du || f.au) {
    filtre.dateVente = {};
    if (f.du) filtre.dateVente.$gte = new Date(f.du);
    if (f.au) {
      const fin = new Date(f.au);
      fin.setHours(23, 59, 59, 999);
      filtre.dateVente.$lte = fin;
    }
  }
  return filtre;
}

async function versDTO(v: any, avecLignes = false): Promise<VenteDTO> {
  const dto: VenteDTO = {
    _id: v._id.toString(),
    numeroVente: v.numeroVente,
    dateVente: v.dateVente?.toISOString?.(),
    kiosqueId:
      typeof v.kiosqueId === "object" && v.kiosqueId?._id
        ? v.kiosqueId._id.toString()
        : v.kiosqueId?.toString(),
    kiosque:
      typeof v.kiosqueId === "object" && v.kiosqueId?._id
        ? {
            _id: v.kiosqueId._id.toString(),
            code: v.kiosqueId.code,
            designation: v.kiosqueId.designation,
          }
        : null,
    vendeurId: v.vendeurId?.toString(),
    vendeurNom: v.vendeurNom,
    clientId: v.clientId?.toString() || null,
    clientNom: v.clientNom || null,
    typeVente: v.typeVente,
    statutVente: v.statutVente,
    montantTotal: v.montantTotal,
    montantPaye: v.montantPaye,
    resteAPayer: v.resteAPayer,
    statutPaiement: v.statutPaiement,
    monnaieRendue: v.monnaieRendue || 0,
    annulation: v.annulation?.motif
      ? {
          motif: v.annulation.motif,
          annuleeLe: v.annulation.annuleeLe?.toISOString?.(),
          annuleeParNom: v.annulation.annuleeParNom,
        }
      : null,
  };
  if (avecLignes) {
    const [lignes, paiements] = await Promise.all([
      LigneVente.find({ venteId: v._id }).sort({ _id: 1 }).lean(),
      Paiement.find({ venteId: v._id }).sort({ datePaiement: 1 }).lean(),
    ]);
    dto.lignes = lignes.map((l) => ({
      produitId: l.produitId.toString(),
      code: l.code,
      designation: l.designation,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      montant: l.montant,
    }));
    dto.paiements = paiements.map((p) => ({
      _id: p._id.toString(),
      mode: p.mode,
      montant: p.montant,
      montantRecu: p.montantRecu,
      monnaieRendue: p.monnaieRendue,
      recuParNom: p.recuParNom,
      datePaiement: p.datePaiement?.toISOString?.(),
      statut: p.statut,
    }));
  }
  return dto;
}

export async function listerVentes(
  user: CurrentUser,
  f: FiltresVentes
): Promise<ListeVentes> {
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre = filtreVentes(user, f);

  const [total, ventes] = await Promise.all([
    Vente.countDocuments(filtre),
    Vente.find(filtre)
      .populate("kiosqueId", "code designation")
      .sort({ dateVente: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    ventes: await Promise.all(ventes.map((v) => versDTO(v))),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

/** Détail d'une vente — même portée que la liste. */
export async function detailVente(
  user: CurrentUser,
  id: string
): Promise<VenteDTO | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const filtre = filtreVentes(user, {});
  filtre._id = oid(id);
  const v = await Vente.findOne(filtre)
    .populate("kiosqueId", "code designation")
    .lean();
  if (!v) return null;
  return versDTO(v, true);
}

// --------------------------- Enregistrement ---------------------------

interface VenteInput {
  kiosqueId: string;
  clientId?: string | null;
  typeVente: "comptant" | "credit";
  lignes: { produitId: string; quantite: number }[];
  paiements: { mode: string; montant: number; montantRecu?: number }[];
  idempotencyKey: string;
  horsLigne?: boolean;
  miseEnFileLe?: string;
}

/**
 * Validation d'une vente — transaction MongoDB :
 * vente + lignes + paiements + créance + mouvements de caisse.
 * Notification et journal APRÈS commit.
 */
export async function enregistrerVente(
  user: CurrentUser,
  data: VenteInput
): Promise<{ vente: VenteDTO; dupliquee: boolean }> {
  const eid = oid(user.entrepriseId!);

  // 1) Idempotence : la même clé revient → la vente déjà enregistrée
  const existante = await Vente.findOne({
    entrepriseId: eid,
    idempotencyKey: data.idempotencyKey,
  }).lean();
  if (existante) {
    return { vente: (await detailVente(user, existante._id.toString()))!, dupliquee: true };
  }

  // 2) Kiosque : appartenance au tenant + droit d'accès utilisateur
  const kiosque = await exigerKiosque(user, data.kiosqueId);
  if (kiosque.statut === "inactif") {
    errHttp("Ce kiosque est désactivé.", 400, "KIOSQUE_INACTIF");
  }

  // 3) Prix officiels re-lus côté serveur — JAMAIS depuis le navigateur
  const idsDemandes = [...new Set(data.lignes.map((l) => l.produitId))];
  if (idsDemandes.some((id) => !Types.ObjectId.isValid(id))) {
    errHttp("Un ou plusieurs produits sont invalides.", 400, "PRODUIT_INVALIDE");
  }
  const produits = await Produit.find({
    _id: { $in: idsDemandes.map(oid) },
    entrepriseId: eid,
  }).lean();
  const parId = new Map(produits.map((p) => [p._id.toString(), p]));
  for (const l of data.lignes) {
    const p = parId.get(l.produitId);
    if (!p) errHttp("Produit introuvable dans votre catalogue.", 400, "PRODUIT_INVALIDE");
    if (p.statut !== "actif") {
      errHttp(`Le produit « ${p.designation} » est désactivé.`, 400, "PRODUIT_INACTIF");
    }
  }

  // 4) Totaux recalculés au tarif officiel (surcharge kiosque incluse)
  const lignes = data.lignes.map((l) => {
    const p = parId.get(l.produitId)!;
    const prixUnitaire = prixPourKiosque(p, kiosque._id.toString());
    return {
      produitId: p._id,
      code: p.code,
      designation: p.designation,
      typeProduit: p.typeProduit,
      quantite: l.quantite,
      prixUnitaire,
      montant: prixUnitaire * l.quantite,
    };
  });
  const montantTotal = lignes.reduce((s, l) => s + l.montant, 0);

  // 5) Paiements : total encaissé + monnaie éventuelle (espèces)
  const paiements = data.paiements || [];
  const montantPaye = paiements.reduce((s, p) => s + p.montant, 0);
  const monnaieRendue = paiements.reduce((s, p) => {
    if (p.mode === "Espèces" && p.montantRecu && p.montantRecu > p.montant) {
      return s + (p.montantRecu - p.montant);
    }
    return s;
  }, 0);
  for (const p of paiements) {
    if (p.mode === "Espèces" && p.montantRecu !== undefined && p.montantRecu < p.montant) {
      errHttp("Le montant reçu en espèces est inférieur au montant encaissé.", 400);
    }
  }

  // 6) Règles comptant / crédit
  let client: any = null;
  if (data.typeVente === "comptant") {
    if (montantPaye !== montantTotal) {
      errHttp(
        `Vente au comptant : le montant encaissé (${montantPaye}) doit égaler le total (${montantTotal}).`,
        400,
        "PAIEMENT_INCOMPLET"
      );
    }
  } else {
    if (!data.clientId || !Types.ObjectId.isValid(data.clientId)) {
      errHttp(
        "Une vente à crédit exige un client identifié.",
        400,
        "CLIENT_REQUIS"
      );
    }
    client = await Client.findOne({
      _id: oid(data.clientId),
      entrepriseId: eid,
      statut: "actif",
    }).lean();
    if (!client) {
      errHttp("Client introuvable ou inactif.", 400, "CLIENT_INVALIDE");
    }
    if (montantPaye > montantTotal) {
      errHttp("Le montant encaissé dépasse le total de la vente.", 400);
    }
  }
  const resteAPayer = montantTotal - montantPaye;
  const statutPaiement =
    resteAPayer === 0 ? "paye" : montantPaye > 0 ? "partiel" : "non_paye";

  // 7) Plafond de crédit éventuel
  if (resteAPayer > 0 && client?.plafondCredit) {
    const encours = await Creance.aggregate([
      {
        $match: {
          entrepriseId: eid,
          clientId: client._id,
          statut: { $in: ["non_paye", "partielle"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$solde" } } },
    ]);
    const du = (encours[0]?.total || 0) + resteAPayer;
    if (du > client.plafondCredit) {
      errHttp(
        `Plafond de crédit dépassé (encours + vente : ${du} > ${client.plafondCredit}).`,
        400,
        "PLAFOND_CREDIT"
      );
    }
  }

  // 8) Transaction : tout ou rien
  const vendeurNom = nomComplet(user);
  const clientNom = client ? nomComplet({ nom: client.nom, prenom: client.prenoms }) : null;
  let venteId: Types.ObjectId | null = null;
  let numeroVente = "";

  try {
    await avecTransaction(async (session) => {
      numeroVente = await nextNumero(eid, "vente", `VTE-${kiosque.code}`, {
        kiosqueId: kiosque._id,
        session,
      });

      // Session de caisse active obligatoire : toute vente entre dans
      // le tiroir (comptant ou acompte crédit) — pas de caisse, pas de vente.
      const caisse = await sessionActive(eid, kiosque._id, session);
      if (!caisse) {
        errHttp(
          "Aucune caisse ouverte sur ce kiosque — ouvrez la caisse avant de vendre.",
          400,
          "CAISSE_FERMEE"
        );
      }

      const [vente] = await Vente.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            numeroVente,
            dateVente: new Date(),
            vendeurId: oid(user._id),
            vendeurNom,
            clientId: client?._id || null,
            clientNom,
            typeVente: data.typeVente,
            statutVente: "validee",
            montantTotal,
            montantPaye,
            resteAPayer,
            statutPaiement,
            monnaieRendue,
            idempotencyKey: data.idempotencyKey,
          },
        ],
        { session }
      );
      venteId = vente._id;

      await LigneVente.insertMany(
        lignes.map((l) => ({
          ...l,
          entrepriseId: eid,
          kiosqueId: kiosque._id,
          venteId,
        })),
        { session }
      );

      if (paiements.length) {
        const docsPaiements = await Paiement.insertMany(
          paiements.map((p) => ({
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            venteId,
            type: "encaissement_vente",
            montant: p.montant,
            mode: p.mode,
            montantRecu: p.mode === "Espèces" ? p.montantRecu : undefined,
            monnaieRendue:
              p.mode === "Espèces" && p.montantRecu
                ? Math.max(0, p.montantRecu - p.montant)
                : undefined,
            recuPar: oid(user._id),
            recuParNom: vendeurNom,
            datePaiement: new Date(),
            statut: "valide",
          })),
          { session }
        );
        // Un mouvement d'entrée par encaissement réel (jamais le crédit)
        await MouvementCaisse.insertMany(
          docsPaiements.map((p) => ({
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            sessionCaisseId: caisse?._id ?? null,
            type: "entree",
            motif: "vente",
            montant: p.montant,
            modePaiement: p.mode,
            venteId,
            paiementId: p._id,
            userId: oid(user._id),
            userNom: vendeurNom,
            date: new Date(),
          })),
          { session }
        );
      }

      if (resteAPayer > 0) {
        await Creance.create(
          [
            {
              entrepriseId: eid,
              kiosqueId: kiosque._id,
              clientId: client._id,
              venteId,
              numeroVente,
              dateVente: new Date(),
              montantInitial: montantTotal,
              montantPaye,
              solde: resteAPayer,
              statut: montantPaye > 0 ? "partielle" : "non_paye",
            },
          ],
          { session }
        );
      }
    });
  } catch (e: any) {
    // Clé d'idempotence en doublon (course) → renvoyer l'existante
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      const deja = await Vente.findOne({
        entrepriseId: eid,
        idempotencyKey: data.idempotencyKey,
      }).lean();
      if (deja) {
        return {
          vente: (await detailVente(user, deja._id.toString()))!,
          dupliquee: true,
        };
      }
    }
    throw e;
  }

  // 9) Après commit uniquement : notification propriétaire + journal
  const resume = lignes.map((l) => `${l.designation} × ${l.quantite}`).join(", ");
  await Notification.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    type: "vente",
    titre: `Nouvelle vente ${numeroVente}`,
    message: `${kiosque.designation} · ${vendeurNom} — ${resume} — ${montantTotal} FCFA${
      data.typeVente === "credit" ? " (crédit)" : ""
    }`,
    venteId,
    numeroVente,
    montant: montantTotal,
    vendeurId: oid(user._id),
    vendeurNom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "vente_validee",
    module: "ventes",
    details: {
      numeroVente, montantTotal, montantPaye, resteAPayer, typeVente: data.typeVente,
      ...(data.horsLigne
        ? { origine: "hors_ligne", miseEnFileLe: data.miseEnFileLe || null }
        : {}),
    },
  });

  return { vente: (await detailVente(user, venteId!.toString()))!, dupliquee: false };
}

// ----------------------------- Annulation -----------------------------

/**
 * Annulation tracée (propriétaire / profil autorisé) : motif obligatoire,
 * vente conservée, paiements invalidés, créance annulée, mouvements de
 * compensation (sortie) pour les montants réellement encaissés.
 */
export async function annulerVente(
  user: CurrentUser,
  id: string,
  motif: string
): Promise<VenteDTO> {
  if (!Types.ObjectId.isValid(id)) errHttp("Vente introuvable.", 404);
  const eid = oid(user.entrepriseId!);
  const vente = await Vente.findOne({ _id: oid(id), entrepriseId: eid }).lean();
  if (!vente) errHttp("Vente introuvable.", 404);
  if (vente.statutVente === "annulee") {
    errHttp("Cette vente est déjà annulée.", 409, "DEJA_ANNULEE");
  }

  const auteurNom = nomComplet(user);
  await avecTransaction(async (session) => {
      await Vente.updateOne(
        { _id: vente._id },
        {
          $set: {
            statutVente: "annulee",
            annulation: {
              motif,
              annuleeLe: new Date(),
              annuleePar: oid(user._id),
              annuleeParNom: auteurNom,
            },
          },
        },
        { session }
      );
      const paiements = await Paiement.find({ venteId: vente._id, statut: "valide" })
        .session(session ?? null)
        .lean();
      if (paiements.length) {
        await Paiement.updateMany(
          { venteId: vente._id, statut: "valide" },
          { $set: { statut: "annule" } },
          { session }
        );
        // Compensation : les montants encaissés ressortent de la caisse
        // actuellement active sur ce kiosque (s'il y en a une).
        const caisse = await sessionActive(eid, vente.kiosqueId, session);
        await MouvementCaisse.insertMany(
          paiements.map((p) => ({
            entrepriseId: eid,
            kiosqueId: vente.kiosqueId,
            sessionCaisseId: caisse?._id ?? null,
            type: "sortie",
            motif: "annulation_vente",
            montant: p.montant,
            modePaiement: p.mode,
            venteId: vente._id,
            paiementId: p._id,
            userId: oid(user._id),
            userNom: auteurNom,
            date: new Date(),
          })),
          { session }
        );
      }
      await Creance.updateOne(
        { venteId: vente._id },
        { $set: { statut: "annulee" } },
        { session }
      );
  });

  await Notification.create({
    entrepriseId: eid,
    kiosqueId: vente.kiosqueId,
    type: "annulation_vente",
    titre: `Vente ${vente.numeroVente} annulée`,
    message: `Annulation par ${auteurNom} — motif : ${motif} — ${vente.montantTotal} FCFA`,
    venteId: vente._id,
    numeroVente: vente.numeroVente,
    montant: vente.montantTotal,
    vendeurId: vente.vendeurId,
    vendeurNom: vente.vendeurNom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: vente.kiosqueId,
    userId: oid(user._id),
    action: "vente_annulee",
    module: "ventes",
    details: {
      numeroVente: vente.numeroVente,
      motif,
      avant: { statutVente: "validee", montantTotal: vente.montantTotal },
      apres: { statutVente: "annulee" },
    },
  });

  return (await detailVente(user, id))!;
}

// ------------------------------ Ticket ------------------------------

export async function donneesTicket(
  user: CurrentUser,
  id: string
): Promise<TicketVente | null> {
  const vente = await detailVente(user, id);
  if (!vente) return null;
  const [entreprise, kiosque] = await Promise.all([
    Entreprise.findById(user.entrepriseId)
      .select("nomSociete nomCommercial telephone adresse ville devise impression")
      .lean(),
    Kiosque.findById(vente.kiosqueId).select("code designation adresse").lean(),
  ]);
  return {
    entreprise: {
      nom: entreprise?.nomCommercial || entreprise?.nomSociete || "EASY-KIOSQUE",
      telephone: entreprise?.telephone,
      adresse: entreprise?.adresse,
      ville: entreprise?.ville,
    },
    kiosque: {
      code: kiosque?.code || "",
      designation: kiosque?.designation || "",
      adresse: kiosque?.adresse,
    },
    vente,
    impression: entreprise?.impression || undefined,
  };
}
