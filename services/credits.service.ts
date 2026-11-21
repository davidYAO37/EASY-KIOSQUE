import { Types } from "mongoose";
import { Creance } from "@/models/creance";
import { Client } from "@/models/client";
import { Kiosque } from "@/models/kiosque";
import { Remboursement } from "@/models/remboursement";
import { Paiement } from "@/models/paiement";
import { MouvementCaisse } from "@/models/mouvementCaisse";
import { Entreprise } from "@/models/entreprise";
import { Notification } from "@/models/notification";
import { JournalActivite } from "@/models/journalActivite";
import { nextNumero } from "@/lib/numero";
import { exigerKiosque } from "@/lib/tenant";
import { sessionActive } from "./caisses.service";
import { avecTransaction } from "@/lib/transaction";
import type { CurrentUser } from "@/lib/auth";
import type {
  CreanceDTO,
  ListeCreances,
  ListeRemboursements,
  RecuRemboursement,
  RemboursementDTO,
} from "@/types/credits";

/**
 * Service métier CRÉDITS — créances et remboursements clients.
 *
 * Règles financières :
 * - Jamais de remboursement supérieur au solde restant.
 * - Transaction : remboursement + maj créances + paiements + mouvements.
 * - Idempotence : `idempotencyKey` unique par entreprise.
 * - Notification propriétaire après commit.
 * - La part non encaissée d'une vente à crédit n'est JAMAIS comptée dans
 *   les mouvements de caisse ; seuls les remboursements réels y entrent.
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

function errHttp(message: string, status = 400, code?: string): never {
  const e: any = new Error(message);
  e.status = status;
  if (code) e.code = code;
  throw e;
}

function nomComplet(u: { nom?: string; prenom?: string }) {
  return [u.prenom, u.nom].filter(Boolean).join(" ").trim() || "Utilisateur";
}

// ------------------------------ Créances ------------------------------

export interface FiltresCreances {
  clientId?: string;
  kiosqueId?: string;
  statut?: string;
  du?: string;
  au?: string;
  page?: number;
  limit?: number;
}

function filtreCreances(user: CurrentUser, f: FiltresCreances) {
  const filtre: any = { entrepriseId: oid(user.entrepriseId!) };
  // Responsable : restreint à ses kiosques ; les autres rôles autorisés
  // voient toute l'entreprise (le vendeur n'a pas l'action consulter_credits).
  if (user.type === "responsable" && user.kiosqueIds?.length) {
    filtre.kiosqueId = { $in: user.kiosqueIds.map(oid) };
  }
  if (f.clientId && Types.ObjectId.isValid(f.clientId)) {
    filtre.clientId = oid(f.clientId);
  }
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    const kid = oid(f.kiosqueId);
    filtre.kiosqueId = filtre.kiosqueId?.$in
      ? { $in: filtre.kiosqueId.$in.filter((k: Types.ObjectId) => k.equals(kid)) }
      : kid;
  }
  if (f.statut && ["non_paye", "partielle", "soldee", "annulee"].includes(f.statut)) {
    filtre.statut = f.statut;
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

function creanceDTO(c: any): CreanceDTO {
  const cl =
    c.clientId && typeof c.clientId === "object" && c.clientId._id ? c.clientId : null;
  const kio =
    c.kiosqueId && typeof c.kiosqueId === "object" && c.kiosqueId._id ? c.kiosqueId : null;
  return {
    _id: c._id.toString(),
    clientId: cl ? cl._id.toString() : c.clientId?.toString(),
    client: cl
      ? { _id: cl._id.toString(), code: cl.code, nom: cl.nom, prenoms: cl.prenoms }
      : null,
    venteId: c.venteId?.toString(),
    numeroVente: c.numeroVente,
    kiosqueId: kio ? kio._id.toString() : c.kiosqueId?.toString(),
    kiosque: kio
      ? { _id: kio._id.toString(), code: kio.code, designation: kio.designation }
      : null,
    dateVente: c.dateVente?.toISOString?.(),
    montantInitial: c.montantInitial,
    montantPaye: c.montantPaye,
    solde: c.solde,
    statut: c.statut,
  };
}

export async function listerCreances(
  user: CurrentUser,
  f: FiltresCreances
): Promise<ListeCreances> {
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre = filtreCreances(user, f);

  const [total, creances, aggr] = await Promise.all([
    Creance.countDocuments(filtre),
    Creance.find(filtre)
      .populate("clientId", "code nom prenoms")
      .populate("kiosqueId", "code designation")
      .sort({ statut: 1, dateVente: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    // Total dû global (créances non soldées du tenant, hors annulées)
    Creance.aggregate([
      {
        $match: {
          entrepriseId: oid(user.entrepriseId!),
          statut: { $in: ["non_paye", "partielle"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$solde" } } },
    ]),
  ]);

  return {
    creances: creances.map(creanceDTO),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
    totalDu: aggr[0]?.total || 0,
  };
}

/** Détail d'une créance + historique des règlements rattachés. */
export async function detailCreance(user: CurrentUser, id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  const filtre = filtreCreances(user, {});
  filtre._id = oid(id);
  const c = await Creance.findOne(filtre)
    .populate("clientId", "code nom prenoms telephone")
    .populate("kiosqueId", "code designation")
    .lean();
  if (!c) return null;

  // Versements passés sur cette créance (via les allocations)
  const remboursements = await Remboursement.find({
    entrepriseId: oid(user.entrepriseId!),
    "allocations.creanceId": c._id,
    statut: "valide",
  })
    .sort({ datePaiement: -1 })
    .lean();

  return {
    creance: creanceDTO(c),
    versements: remboursements.flatMap((r) =>
      r.allocations
        .filter((a) => a.creanceId.toString() === c._id.toString())
        .map((a) => ({
          remboursementId: r._id.toString(),
          numero: r.numero,
          datePaiement: r.datePaiement?.toISOString?.(),
          montant: a.montant,
          mode: r.mode,
          recuParNom: r.recuParNom,
        }))
    ),
  };
}

// --------------------------- Remboursements ---------------------------

interface RemboursementInput {
  kiosqueId: string;
  clientId: string;
  montant: number;
  mode: string;
  reference?: string;
  allocations?: { creanceId: string; montant: number }[];
  idempotencyKey: string;
}

/**
 * Encaissement d'un remboursement — transaction :
 * remboursement + mise à jour des créances + paiements + mouvements
 * de caisse d'entrée. Jamais au-delà du solde restant.
 */
export async function enregistrerRemboursement(
  user: CurrentUser,
  data: RemboursementInput
): Promise<{ remboursement: RemboursementDTO; dupliquee: boolean }> {
  const eid = oid(user.entrepriseId!);

  // Idempotence
  const existant = await Remboursement.findOne({
    entrepriseId: eid,
    idempotencyKey: data.idempotencyKey,
  }).lean();
  if (existant) {
    return {
      remboursement: (await detailRemboursement(user, existant._id.toString()))!,
      dupliquee: true,
    };
  }

  const kiosque = await exigerKiosque(user, data.kiosqueId);
  const client = await Client.findOne({
    _id: oid(data.clientId),
    entrepriseId: eid,
  }).lean();
  if (!client) errHttp("Client introuvable.", 400, "CLIENT_INVALIDE");

  // Créances ouvertes du client, de la plus ancienne à la plus récente
  const creances = await Creance.find({
    entrepriseId: eid,
    clientId: client._id,
    statut: { $in: ["non_paye", "partielle"] },
  })
    .sort({ dateVente: 1 })
    .lean();
  const soldeTotal = creances.reduce((s, c) => s + c.solde, 0);
  if (creances.length === 0) {
    errHttp("Ce client n'a aucune créance en cours.", 400, "AUCUNE_CREANCE");
  }
  if (data.montant > soldeTotal) {
    errHttp(
      `Le montant (${data.montant}) dépasse le solde restant du client (${soldeTotal}).`,
      400,
      "MONTANT_EXCESSIF"
    );
  }

  // Ventilation : explicite ou automatique (ancienneté)
  const parId = new Map(creances.map((c) => [c._id.toString(), c]));
  let allocations: { creance: any; montant: number }[] = [];
  if (data.allocations?.length) {
    for (const a of data.allocations) {
      const c = parId.get(a.creanceId);
      if (!c) {
        errHttp("Une créance de la ventilation est invalide.", 400, "ALLOCATION_INVALIDE");
      }
      if (a.montant > c.solde) {
        errHttp(
          `Le versement sur ${c.numeroVente} (${a.montant}) dépasse son solde (${c.solde}).`,
          400,
          "MONTANT_EXCESSIF"
        );
      }
      allocations.push({ creance: c, montant: a.montant });
    }
    const somme = allocations.reduce((s, a) => s + a.montant, 0);
    if (somme !== data.montant) {
      errHttp(
        `La ventilation (${somme}) ne correspond pas au montant encaissé (${data.montant}).`,
        400,
        "VENTILATION_INCOHERENTE"
      );
    }
  } else {
    let reste = data.montant;
    for (const c of creances) {
      if (reste <= 0) break;
      const part = Math.min(reste, c.solde);
      allocations.push({ creance: c, montant: part });
      reste -= part;
    }
  }

  const recuParNom = nomComplet(user);
  const clientNom = nomComplet({ nom: client.nom, prenom: client.prenoms });
  let remboursementId: Types.ObjectId | null = null;
  let numero = "";

  try {
    await avecTransaction(async (session) => {
      numero = await nextNumero(eid, "remboursement", `RMB-${kiosque.code}`, {
        kiosqueId: kiosque._id,
        session,
      });

      // Session de caisse active obligatoire : un remboursement est une
      // entrée réelle d'argent dans le tiroir.
      const caisse = await sessionActive(eid, kiosque._id, session);
      if (!caisse) {
        errHttp(
          "Aucune caisse ouverte sur ce kiosque — ouvrez la caisse avant d'encaisser un remboursement.",
          400,
          "CAISSE_FERMEE"
        );
      }

      const [rmb] = await Remboursement.create(
        [
          {
            entrepriseId: eid,
            kiosqueId: kiosque._id,
            clientId: client._id,
            clientNom,
            numero,
            datePaiement: new Date(),
            montantTotal: data.montant,
            mode: data.mode,
            reference: data.reference || undefined,
            allocations: allocations.map((a) => ({
              creanceId: a.creance._id,
              venteId: a.creance.venteId,
              numeroVente: a.creance.numeroVente,
              montant: a.montant,
            })),
            recuPar: oid(user._id),
            recuParNom,
            idempotencyKey: data.idempotencyKey,
            statut: "valide",
          },
        ],
        { session }
      );
      remboursementId = rmb._id;

      // Mise à jour des créances + paiement + mouvement par allocation
      for (const a of allocations) {
        const nouveauPaye = a.creance.montantPaye + a.montant;
        const nouveauSolde = a.creance.solde - a.montant;
        const nouveauStatut =
          nouveauSolde === 0 ? "soldee" : "partielle";
        await Creance.updateOne(
          { _id: a.creance._id, solde: a.creance.solde }, // garde optimiste
          {
            $set: {
              montantPaye: nouveauPaye,
              solde: nouveauSolde,
              statut: nouveauStatut,
            },
          },
          { session }
        );

        const [pmt] = await Paiement.create(
          [
            {
              entrepriseId: eid,
              kiosqueId: kiosque._id,
              venteId: a.creance.venteId,
              creanceId: a.creance._id,
              type: "remboursement_creance",
              montant: a.montant,
              mode: data.mode,
              recuPar: oid(user._id),
              recuParNom,
              datePaiement: new Date(),
              statut: "valide",
            },
          ],
          { session }
        );
        await MouvementCaisse.create(
          [
            {
              entrepriseId: eid,
              kiosqueId: kiosque._id,
              sessionCaisseId: caisse?._id ?? null,
              type: "entree",
              motif: "remboursement",
              montant: a.montant,
              modePaiement: data.mode,
              venteId: a.creance.venteId,
              paiementId: pmt._id,
              userId: oid(user._id),
              userNom: recuParNom,
              date: new Date(),
            },
          ],
          { session }
        );
      }
    });
  } catch (e: any) {
    if (e?.code === 11000 || e?.errorResponse?.code === 11000) {
      const deja = await Remboursement.findOne({
        entrepriseId: eid,
        idempotencyKey: data.idempotencyKey,
      }).lean();
      if (deja) {
        return {
          remboursement: (await detailRemboursement(user, deja._id.toString()))!,
          dupliquee: true,
        };
      }
    }
    throw e;
  }

  // Après commit : notification + journal
  await Notification.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    type: "remboursement",
    titre: `Remboursement ${numero}`,
    message: `${kiosque.designation} · ${clientNom} — ${data.montant} FCFA (${data.mode}) reçu par ${recuParNom}`,
    montant: data.montant,
    vendeurId: oid(user._id),
    vendeurNom: recuParNom,
  });
  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "remboursement_enregistre",
    module: "credits",
    details: {
      numero,
      clientId: data.clientId,
      montant: data.montant,
      mode: data.mode,
      allocations: allocations.map((a) => ({
        numeroVente: a.creance.numeroVente,
        montant: a.montant,
      })),
    },
  });

  return {
    remboursement: (await detailRemboursement(user, remboursementId!.toString()))!,
    dupliquee: false,
  };
}

// ------------------------ Lecture remboursements ------------------------

export interface FiltresRemboursements {
  clientId?: string;
  kiosqueId?: string;
  du?: string;
  au?: string;
  page?: number;
  limit?: number;
}

function filtreRmb(user: CurrentUser, f: FiltresRemboursements) {
  const filtre: any = { entrepriseId: oid(user.entrepriseId!), statut: "valide" };
  if (user.type === "responsable" && user.kiosqueIds?.length) {
    filtre.kiosqueId = { $in: user.kiosqueIds.map(oid) };
  }
  if (f.clientId && Types.ObjectId.isValid(f.clientId)) filtre.clientId = oid(f.clientId);
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    const kid = oid(f.kiosqueId);
    filtre.kiosqueId = filtre.kiosqueId?.$in
      ? { $in: filtre.kiosqueId.$in.filter((k: Types.ObjectId) => k.equals(kid)) }
      : kid;
  }
  if (f.du || f.au) {
    filtre.datePaiement = {};
    if (f.du) filtre.datePaiement.$gte = new Date(f.du);
    if (f.au) {
      const fin = new Date(f.au);
      fin.setHours(23, 59, 59, 999);
      filtre.datePaiement.$lte = fin;
    }
  }
  return filtre;
}

function rmbDTO(r: any): RemboursementDTO {
  const kio =
    r.kiosqueId && typeof r.kiosqueId === "object" && r.kiosqueId._id ? r.kiosqueId : null;
  return {
    _id: r._id.toString(),
    numero: r.numero,
    datePaiement: r.datePaiement?.toISOString?.(),
    kiosqueId: kio ? kio._id.toString() : r.kiosqueId?.toString(),
    kiosque: kio
      ? { _id: kio._id.toString(), code: kio.code, designation: kio.designation }
      : null,
    clientId: r.clientId?.toString(),
    clientNom: r.clientNom,
    montantTotal: r.montantTotal,
    mode: r.mode,
    reference: r.reference,
    recuParNom: r.recuParNom,
    allocations: (r.allocations || []).map((a: any) => ({
      creanceId: a.creanceId.toString(),
      venteId: a.venteId.toString(),
      numeroVente: a.numeroVente,
      montant: a.montant,
    })),
    statut: r.statut,
  };
}

export async function listerRemboursements(
  user: CurrentUser,
  f: FiltresRemboursements
): Promise<ListeRemboursements> {
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre = filtreRmb(user, f);

  const [total, liste] = await Promise.all([
    Remboursement.countDocuments(filtre),
    Remboursement.find(filtre)
      .populate("kiosqueId", "code designation")
      .sort({ datePaiement: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return {
    remboursements: liste.map(rmbDTO),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

export async function detailRemboursement(user: CurrentUser, id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  const filtre = filtreRmb(user, {});
  delete filtre.statut;
  filtre._id = oid(id);
  const r = await Remboursement.findOne(filtre)
    .populate("kiosqueId", "code designation")
    .lean();
  return r ? rmbDTO(r) : null;
}

/** Données du reçu imprimable (+ solde restant du client). */
export async function donneesRecu(
  user: CurrentUser,
  id: string
): Promise<RecuRemboursement | null> {
  const rmb = await detailRemboursement(user, id);
  if (!rmb) return null;
  const [entreprise, kiosque, encours] = await Promise.all([
    Entreprise.findById(user.entrepriseId)
      .select("nomSociete nomCommercial telephone adresse ville impression")
      .lean(),
    Kiosque.findById(rmb.kiosqueId).select("code designation adresse").lean(),
    Creance.aggregate([
      {
        $match: {
          entrepriseId: oid(user.entrepriseId!),
          clientId: oid(rmb.clientId),
          statut: { $in: ["non_paye", "partielle"] },
        },
      },
      { $group: { _id: null, total: { $sum: "$solde" } } },
    ]),
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
    remboursement: rmb,
    soldeRestantClient: encours[0]?.total || 0,
    impression: entreprise?.impression || undefined,
  };
}
