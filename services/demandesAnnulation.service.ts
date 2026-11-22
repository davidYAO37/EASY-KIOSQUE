import { Types } from "mongoose";
import { DemandeAnnulation } from "@/models/demandeAnnulation";
import { Vente } from "@/models/vente";
import { Notification } from "@/models/notification";
import { JournalActivite } from "@/models/journalActivite";
import { Entreprise } from "@/models/entreprise";
import { MouvementCaisse } from "@/models/mouvementCaisse";
import { SessionCaisse } from "@/models/sessionCaisse";
import type { CurrentUser } from "@/lib/auth";
import { annulerVente, filtreVentes } from "./ventes.service";
import type { DemandeAnnulationDTO, ListeDemandesAnnulation } from "@/types/ventes";

/**
 * Demandes d'annulation de vente — workflow en deux temps.
 *
 * - Tout utilisateur peut demander l'annulation d'une vente DANS SA PORTÉE
 *   (vendeur/caissier : uniquement leurs propres ventes).
 * - La validation/rejet exige l'action `annuler_vente` (contrôlée par la
 *   route). La validation réutilise `annulerVente` : vente conservée,
 *   compensation caisse, journal — mêmes règles qu'une annulation directe.
 * - Historisée : demandeur, motif, validateur, motif de rejet, dates.
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

function versDTO(d: any): DemandeAnnulationDTO {
  return {
    _id: d._id.toString(),
    venteId: d.venteId.toString(),
    numeroVente: d.numeroVente,
    montantTotal: d.montantTotal,
    dateVente: d.dateVente?.toISOString?.(),
    kiosqueId: d.kiosqueId?.toString(),
    kiosque:
      typeof d.kiosqueId === "object" && d.kiosqueId?._id
        ? { _id: d.kiosqueId._id.toString(), code: d.kiosqueId.code, designation: d.kiosqueId.designation }
        : null,
    demandeurId: d.demandeurId.toString(),
    demandeurNom: d.demandeurNom,
    motif: d.motif,
    statut: d.statut,
    traiteLe: d.traiteLe?.toISOString?.() || null,
    traiteParNom: d.traiteParNom || null,
    motifRejet: d.motifRejet || null,
    createdAt: d.createdAt?.toISOString?.(),
  };
}

/** Crée une demande d'annulation sur une vente validée de la portée du demandeur. */
export async function creerDemande(
  user: CurrentUser,
  venteId: string,
  motif: string
): Promise<DemandeAnnulationDTO> {
  if (!Types.ObjectId.isValid(venteId)) errHttp("Vente introuvable.", 404);
  const filtre = filtreVentes(user, {});
  filtre._id = oid(venteId);
  const vente = await Vente.findOne(filtre).lean();
  if (!vente) errHttp("Vente introuvable dans votre portée.", 404);
  if (vente.statutVente === "annulee") {
    errHttp("Cette vente est déjà annulée.", 409, "DEJA_ANNULEE");
  }

  // Délai configurable par l'entreprise (heures ; 0 = sans limite, défaut 24 h).
  // Au-delà, la correction relève d'une régularisation par le propriétaire.
  const ent = await Entreprise.findById(vente.entrepriseId)
    .select("delaiDemandeAnnulationH")
    .lean();
  const delaiH = ent?.delaiDemandeAnnulationH ?? 24;
  if (
    delaiH > 0 &&
    vente.dateVente &&
    Date.now() - new Date(vente.dateVente).getTime() > delaiH * 3_600_000
  ) {
    errHttp(
      `Délai dépassé : une demande d'annulation est possible dans les ${delaiH} h suivant la vente.`,
      400,
      "DELAI_DEPASSE"
    );
  }

  // Jamais après la clôture : la vente appartient à une caisse déjà arrêtée,
  // sa correction relève du propriétaire, pas d'une demande d'opérateur.
  const mvt = await MouvementCaisse.findOne({
    entrepriseId: vente.entrepriseId,
    venteId: vente._id,
    sessionCaisseId: { $ne: null },
  }).lean();
  if (mvt?.sessionCaisseId) {
    const session = await SessionCaisse.findById(mvt.sessionCaisseId)
      .select("statut")
      .lean();
    if (session?.statut === "cloturee") {
      errHttp(
        "La caisse de cette vente est clôturée — demande impossible.",
        400,
        "CAISSE_CLOTUREE"
      );
    }
  }

  const demandeurNom = nomComplet(user);
  let demande;
  try {
    demande = await DemandeAnnulation.create({
      entrepriseId: vente.entrepriseId,
      kiosqueId: vente.kiosqueId,
      venteId: vente._id,
      numeroVente: vente.numeroVente,
      montantTotal: vente.montantTotal,
      dateVente: vente.dateVente,
      demandeurId: oid(user._id),
      demandeurNom,
      motif,
    });
  } catch (e: any) {
    if (e?.code === 11000) {
      errHttp("Une demande d'annulation est déjà en attente sur cette vente.", 409, "DEMANDE_EXISTANTE");
    }
    throw e;
  }

  await Notification.create({
    entrepriseId: vente.entrepriseId,
    kiosqueId: vente.kiosqueId,
    type: "demande_annulation",
    titre: `Annulation demandée — ${vente.numeroVente}`,
    message: `${demandeurNom} demande l'annulation de ${vente.numeroVente} (${vente.montantTotal} FCFA) — motif : ${motif}`,
    venteId: vente._id,
    numeroVente: vente.numeroVente,
    montant: vente.montantTotal,
    vendeurId: oid(user._id),
    vendeurNom: demandeurNom,
  });
  await JournalActivite.create({
    entrepriseId: vente.entrepriseId,
    kiosqueId: vente.kiosqueId,
    userId: oid(user._id),
    action: "demande_annulation_vente",
    module: "ventes",
    details: { numeroVente: vente.numeroVente, montantTotal: vente.montantTotal, motif },
  });

  return versDTO(demande);
}

export interface FiltresDemandes {
  statut?: string;
  demandeurId?: string;
  kiosqueId?: string;
  du?: string;
  au?: string;
  page?: number;
  limit?: number;
}

/** Liste les demandes : tout le tenant pour les validateurs/admins, sinon les siennes. */
export async function listerDemandes(
  user: CurrentUser,
  f: FiltresDemandes
): Promise<ListeDemandesAnnulation> {
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre: any = { entrepriseId: oid(user.entrepriseId!) };

  const voitTout = ["admin", "gestionnaire", "comptable"].includes(user.type);
  if (!voitTout) {
    filtre.demandeurId = oid(user._id);
  } else if (f.demandeurId && Types.ObjectId.isValid(f.demandeurId)) {
    filtre.demandeurId = oid(f.demandeurId);
  }
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    filtre.kiosqueId = oid(f.kiosqueId);
  }
  if (["en_attente", "approuvee", "rejetee"].includes(f.statut || "")) {
    filtre.statut = f.statut;
  }
  if (f.du || f.au) {
    filtre.createdAt = {};
    if (f.du) {
      const debut = new Date(f.du);
      if (!f.du.includes("T")) debut.setHours(0, 0, 0, 0);
      filtre.createdAt.$gte = debut;
    }
    if (f.au) {
      const fin = new Date(f.au);
      if (!f.au.includes("T")) fin.setHours(23, 59, 59, 999);
      filtre.createdAt.$lte = fin;
    }
  }

  const [total, demandes] = await Promise.all([
    DemandeAnnulation.countDocuments(filtre),
    DemandeAnnulation.find(filtre)
      .populate("kiosqueId", "code designation")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    demandes: demandes.map(versDTO),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

/** Demandeurs distincts du tenant (filtre « par demandeur » côté admin). */
export async function listerDemandeurs(user: CurrentUser) {
  const voitTout = ["admin", "gestionnaire", "comptable"].includes(user.type);
  const filtre: any = { entrepriseId: oid(user.entrepriseId!) };
  if (!voitTout) filtre.demandeurId = oid(user._id);
  const rows = await DemandeAnnulation.aggregate<{ _id: Types.ObjectId; nom: string }>([
    { $match: filtre },
    { $group: { _id: "$demandeurId", nom: { $last: "$demandeurNom" } } },
    { $sort: { nom: 1 } },
  ]);
  return rows.map((r) => ({ _id: r._id.toString(), nom: r.nom }));
}

/**
 * Traite une demande : `valider` exécute l'annulation réelle (annulerVente),
 * `rejeter` exige un motif. L'action `annuler_vente` est exigée par la route.
 */
export async function traiterDemande(
  user: CurrentUser,
  id: string,
  decision: "valider" | "rejeter",
  motifRejet?: string
): Promise<DemandeAnnulationDTO> {
  if (!Types.ObjectId.isValid(id)) errHttp("Demande introuvable.", 404);
  const eid = oid(user.entrepriseId!);
  const demande = await DemandeAnnulation.findOne({ _id: oid(id), entrepriseId: eid });
  if (!demande) errHttp("Demande introuvable.", 404);
  if (demande.statut !== "en_attente") {
    errHttp("Cette demande a déjà été traitée.", 409, "DEJA_TRAITEE");
  }

  const traiteParNom = nomComplet(user);
  if (decision === "valider") {
    // L'annulation réelle applique toutes les règles (compensation caisse,
    // créance, journal). Le motif historise l'origine de la décision.
    await annulerVente(
      user,
      demande.venteId.toString(),
      `${demande.motif} (demande de ${demande.demandeurNom})`
    );
    demande.statut = "approuvee";
  } else {
    if (!motifRejet || motifRejet.trim().length < 3) {
      errHttp("Un motif de rejet (3 caractères min.) est obligatoire.", 400, "MOTIF_REQUIS");
    }
    demande.statut = "rejetee";
    demande.motifRejet = motifRejet.trim();
  }
  demande.traiteLe = new Date();
  demande.traiteParId = oid(user._id);
  demande.traiteParNom = traiteParNom;
  await demande.save();

  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: demande.kiosqueId,
    userId: oid(user._id),
    action: decision === "valider" ? "demande_annulation_approuvee" : "demande_annulation_rejetee",
    module: "ventes",
    details: {
      numeroVente: demande.numeroVente,
      demandeurNom: demande.demandeurNom,
      motifDemande: demande.motif,
      motifRejet: demande.motifRejet || null,
    },
  });

  return versDTO(demande);
}
