import { Types } from "mongoose";
import { Vente } from "@/models/vente";
import { LigneVente } from "@/models/ligneVente";
import { Paiement } from "@/models/paiement";
import { Remboursement } from "@/models/remboursement";
import { Creance } from "@/models/creance";
import { Client } from "@/models/client";
import { Depense } from "@/models/depense";
import { SessionCaisse } from "@/models/sessionCaisse";
import { Remise } from "@/models/remise";
import { Kiosque } from "@/models/kiosque";
import { Produit } from "@/models/produit";
import { User } from "@/models/users.model";
import { CategorieDepense } from "@/models/categorieDepense";
import { kiosquesAutorises } from "@/lib/tenant";
import { hasActionPermission } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";

/**
 * Service métier rapports & tableau de bord.
 *
 * - Portée multi-tenant stricte : `entrepriseId` de session + kiosques
 *   autorisés (`kiosqueIds` vide = tous).
 * - `consulter_rapports` requis pour les rapports complets (vendeur/caissier
 *   exclus — le tableau de bord leur renvoie une version limitée à leurs
 *   propres ventes).
 * - Montants : ventes `validee`, paiements `valide`, dépenses `validee`,
 *   créances avec `solde > 0`. Rien d'annulé ne fausse les chiffres.
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

function debutJour(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function finJour(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function plage(du?: string, au?: string) {
  const debut = du ? debutJour(new Date(du)) : debutJour();
  const fin = au ? finJour(new Date(au)) : finJour();
  return { $gte: debut, $lte: fin };
}

/** Kiosques en portée + filtre kiosqueId éventuel (re-vérifié). */
async function perimetre(user: CurrentUser, kiosqueId?: string) {
  const kiosques = await kiosquesAutorises(user);
  let ids = kiosques.map((k) => k._id);
  if (kiosqueId) {
    if (!Types.ObjectId.isValid(kiosqueId) || !ids.some((id) => id.equals(oid(kiosqueId)))) {
      throw Object.assign(new Error('Kiosque introuvable ou non autorisé'), { status: 404, code: 'KIOSQUE_INVALIDE' });
    }
    ids = ids.filter((id) => id.equals(oid(kiosqueId)));
  }
  const map = new Map(kiosques.map((k) => [String(k._id), k]));
  return { ids, map };
}

async function nomsVendeurs(eid: Types.ObjectId, ids: Types.ObjectId[]) {
  const users = await User.find({ entrepriseId: eid, _id: { $in: ids } }).select("nom prenom name").lean();
  const m = new Map(
    users.map((u) => [String(u._id), [u.prenom, u.nom].filter(Boolean).join(" ").trim() || u.name || "Utilisateur"])
  );
  return (id: any) => m.get(String(id)) || "Utilisateur";
}

// ============================ TABLEAU DE BORD ============================

export async function tableauDeBord(user: CurrentUser, kiosqueId?: string) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user, kiosqueId);
  const controleur = hasActionPermission(user!, "consulter_rapports");

  const filtreBase: any = { entrepriseId: eid, kiosqueId: { $in: ids } };
  if (!controleur) filtreBase.vendeurId = oid(user._id); // vendeur/caissier : ses ventes
  const jour = { $gte: debutJour(), $lte: finJour() };

  // Ventes du jour (validées)
  const vJourRequete = Vente.aggregate([
    { $match: { ...filtreBase, statutVente: "validee", dateVente: jour } },
    {
      $group: {
        _id: null,
        ca: { $sum: "$montantTotal" },
        nb: { $sum: 1 },
        encaisse: { $sum: "$montantPaye" },
      },
    },
  ]);

  // Encaissements du jour par mode de paiement (ventes + remboursements
  // de créances ; hors paiements annulés). Vendeur/caissier : ses
  // encaissements seulement (`recuPar`).
  const parModeRequete = Paiement.aggregate([
    {
      $match: {
        entrepriseId: eid,
        kiosqueId: { $in: ids },
        statut: "valide",
        type: { $ne: "annulation_vente" },
        datePaiement: jour,
        ...(controleur ? {} : { recuPar: oid(user._id) }),
      },
    },
    { $group: { _id: "$mode", montant: { $sum: "$montant" }, nb: { $sum: 1 } } },
    { $sort: { montant: -1 } },
  ]);

  // Remboursements de créances encaissés aujourd'hui
  const rmbRequete = controleur
    ? Remboursement.aggregate([
        { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, datePaiement: jour } },
        { $group: { _id: null, total: { $sum: "$montantTotal" } } },
      ])
    : [null];

  // Dépenses du jour (contrôleurs uniquement)
  const depRequete = controleur
    ? Depense.aggregate([
        { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, statut: "validee", dateDepense: jour } },
        { $group: { _id: null, total: { $sum: "$montant" }, nb: { $sum: 1 } } },
      ])
    : [null];

  // Créances restantes (contrôleurs)
  const creancesRequete = controleur
    ? Creance.aggregate([
        { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, solde: { $gt: 0 }, statut: { $ne: "annulee" } } },
        { $group: { _id: null, du: { $sum: "$solde" }, nb: { $sum: 1 } } },
      ])
    : [null];

  // Alertes exploitation (contrôleurs)
  const alertesRequete = controleur
    ? Promise.all([
        Remise.aggregate([
          { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, statut: "declaree" } },
          { $group: { _id: null, total: { $sum: "$montant" }, nb: { $sum: 1 } } },
        ]),
        SessionCaisse.countDocuments({
          entrepriseId: eid,
          kiosqueId: { $in: ids },
          statut: { $in: ["ouverte", "en_cloture"] },
        }),
      ])
    : [null, null];

  // Série 7 jours : CA par jour
  const il7 = debutJour(new Date(Date.now() - 6 * 86400000));
  const serieRequete = Vente.aggregate([
    { $match: { ...filtreBase, statutVente: "validee", dateVente: { $gte: il7 } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateVente" } },
        ca: { $sum: "$montantTotal" },
        nb: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const [[vJour], parModeRaw, [rmbJour], [depJour], [creances], alertes, serieRaw] = await Promise.all([
    vJourRequete, parModeRequete, rmbRequete, depRequete, creancesRequete, alertesRequete, serieRequete,
  ]);
  const [remisesAttente, caissesOuvertes] = alertes;
  const serieMap = new Map(serieRaw.map((s) => [s._id, s]));
  const serie7j: { date: string; ca: number; nb: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const cle = d.toISOString().slice(0, 10);
    const s = serieMap.get(cle);
    serie7j.push({ date: cle, ca: s?.ca || 0, nb: s?.nb || 0 });
  }

  // Répartition du jour par kiosque (contrôleurs)
  let parKiosque: any[] = [];
  if (controleur) {
    const [agg, depParKiosque] = await Promise.all([
      Vente.aggregate([
        { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, statutVente: "validee", dateVente: jour } },
        { $group: { _id: "$kiosqueId", ca: { $sum: "$montantTotal" }, nb: { $sum: 1 } } },
      ]),
      Depense.aggregate([
        { $match: { entrepriseId: eid, kiosqueId: { $in: ids }, statut: "validee", dateDepense: jour } },
        { $group: { _id: "$kiosqueId", total: { $sum: "$montant" } } },
      ]),
    ]);
    const depMap = new Map(depParKiosque.map((d) => [String(d._id), d.total]));
    parKiosque = ids.map((id) => {
      const v = agg.find((a) => String(a._id) === String(id));
      return {
        kiosqueId: String(id),
        designation: map.get(String(id))?.designation || "Kiosque",
        ca: v?.ca || 0,
        nbVentes: v?.nb || 0,
        depenses: depMap.get(String(id)) || 0,
      };
    });
  }

  // Top produits du jour
  const topRaw = await Vente.aggregate([
    { $match: { ...filtreBase, statutVente: 'validee', dateVente: jour } },
    { $lookup: { from: 'lignesventes', localField: '_id', foreignField: 'venteId', as: 'lignes' } },
    { $unwind: '$lignes' },
    { $match: { 'lignes.entrepriseId': eid, 'lignes.kiosqueId': { $in: ids } } },
    { $group: { _id: '$lignes.designation', quantite: { $sum: '$lignes.quantite' }, montant: { $sum: '$lignes.montant' } } },
    { $sort: { quantite: -1 } },
    { $limit: 5 },
  ]);

  return {
    controleur,
    jour: {
      ca: vJour?.ca || 0,
      nbVentes: vJour?.nb || 0,
      encaissements: (vJour?.encaisse || 0) + (rmbJour?.total || 0),
      remboursements: rmbJour?.total || 0,
      depenses: depJour?.total || 0,
      nbDepenses: depJour?.nb || 0,
      creancesDu: creances?.du || 0,
      nbCreances: creances?.nb || 0,
      remisesEnAttente: remisesAttente?.[0]?.nb || 0,
      montantRemisesEnAttente: remisesAttente?.[0]?.total || 0,
      caissesOuvertes: caissesOuvertes || 0,
    },
    serie7j,
    parKiosque,
    parMode: parModeRaw.map((m) => ({ mode: m._id || "Autre", montant: m.montant, nb: m.nb })),
    topProduits: topRaw.map((t) => ({ designation: t._id, quantite: t.quantite, montant: t.montant })),
  };
}

// ============================ RAPPORT VENTES ============================

export async function rapportVentes(
  user: CurrentUser,
  f: { du?: string; au?: string; kiosqueId?: string }
) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user, f.kiosqueId);
  const match = {
    entrepriseId: eid,
    kiosqueId: { $in: ids },
    statutVente: "validee",
    dateVente: plage(f.du, f.au),
  };

  const [parJour, parKiosque, parVendeur, totaux, parMode] = await Promise.all([
    Vente.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            jour: { $dateToString: { format: "%Y-%m-%d", date: "$dateVente" } },
            type: "$typeVente",
          },
          ca: { $sum: "$montantTotal" },
          nb: { $sum: 1 },
        },
      },
      { $sort: { "_id.jour": 1 } },
    ]),
    Vente.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$kiosqueId",
          ca: { $sum: "$montantTotal" },
          encaisse: { $sum: "$montantPaye" },
          nb: { $sum: 1 },
          nbCredit: { $sum: { $cond: [{ $eq: ["$typeVente", "credit"] }, 1, 0] } },
        },
      },
    ]),
    Vente.aggregate([
      { $match: match },
      { $group: { _id: "$vendeurId", ca: { $sum: "$montantTotal" }, nb: { $sum: 1 } } },
      { $sort: { ca: -1 } },
    ]),
    Vente.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          ca: { $sum: "$montantTotal" },
          encaisse: { $sum: "$montantPaye" },
          nb: { $sum: 1 },
          caCredit: { $sum: { $cond: [{ $eq: ["$typeVente", "credit"] }, "$montantTotal", 0] } },
          caComptant: { $sum: { $cond: [{ $eq: ["$typeVente", "comptant"] }, "$montantTotal", 0] } },
        },
      },
    ]),
    // Encaissements par mode de paiement sur la période (ventes +
    // remboursements de créances ; hors paiements annulés)
    Paiement.aggregate([
      {
        $match: {
          entrepriseId: eid,
          kiosqueId: { $in: ids },
          statut: "valide",
          type: { $ne: "annulation_vente" },
          datePaiement: plage(f.du, f.au),
        },
      },
      { $group: { _id: "$mode", montant: { $sum: "$montant" }, nb: { $sum: 1 } } },
      { $sort: { montant: -1 } },
    ]),
  ]);

  const topProduits = await Vente.aggregate([
    { $match: match },
    { $lookup: { from: 'lignesventes', localField: '_id', foreignField: 'venteId', as: 'lignes' } },
    { $unwind: '$lignes' },
    { $match: { 'lignes.entrepriseId': eid, 'lignes.kiosqueId': { $in: ids } } },
    { $group: {
      _id: { designation: '$lignes.designation', code: '$lignes.code' },
      quantite: { $sum: '$lignes.quantite' }, montant: { $sum: '$lignes.montant' },
    } },
    { $sort: { montant: -1 } },
    { $limit: 10 },
  ]);

  // Jours consolidés (comptant + crédit sur la même ligne)
  const joursMap = new Map<string, any>();
  for (const r of parJour) {
    const d = joursMap.get(r._id.jour) || { date: r._id.jour, ca: 0, nb: 0, comptant: 0, credit: 0 };
    d.ca += r.ca;
    d.nb += r.nb;
    if (r._id.type === "credit") d.credit += r.ca;
    else d.comptant += r.ca;
    joursMap.set(r._id.jour, d);
  }

  const nomDe = await nomsVendeurs(eid, parVendeur.map((v) => v._id));

  const t = totaux[0] || { ca: 0, encaisse: 0, nb: 0, caCredit: 0, caComptant: 0 };
  return {
    parJour: [...joursMap.values()],
    parKiosque: parKiosque
      .map((k) => ({
        kiosqueId: String(k._id),
        designation: map.get(String(k._id))?.designation || "Kiosque",
        ca: k.ca,
        encaisse: k.encaisse,
        nbVentes: k.nb,
        nbCredit: k.nbCredit,
        panierMoyen: k.nb ? Math.round(k.ca / k.nb) : 0,
      }))
      .sort((a, b) => b.ca - a.ca),
    parVendeur: parVendeur.map((v) => ({
      vendeurId: String(v._id),
      vendeur: nomDe(v._id),
      ca: v.ca,
      nbVentes: v.nb,
      panierMoyen: v.nb ? Math.round(v.ca / v.nb) : 0,
    })),
    topProduits: topProduits.map((p) => ({
      code: p._id.code,
      designation: p._id.designation,
      quantite: p.quantite,
      montant: p.montant,
    })),
    parMode: parMode.map((m) => ({ mode: m._id || "Autre", montant: m.montant, nb: m.nb })),
    totaux: {
      ca: t.ca,
      encaisse: t.encaisse,
      nbVentes: t.nb,
      caComptant: t.caComptant,
      caCredit: t.caCredit,
      panierMoyen: t.nb ? Math.round(t.ca / t.nb) : 0,
    },
  };
}

// ============================ COMPARAISON KIOSQUES ============================

export async function comparaisonKiosques(
  user: CurrentUser,
  f: { du?: string; au?: string }
) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user);
  const dates = plage(f.du, f.au);
  const base = { entrepriseId: eid, kiosqueId: { $in: ids } };

  const [ventes, depenses, ecarts] = await Promise.all([
    Vente.aggregate([
      { $match: { ...base, statutVente: "validee", dateVente: dates } },
      {
        $group: {
          _id: "$kiosqueId",
          ca: { $sum: "$montantTotal" },
          encaisse: { $sum: "$montantPaye" },
          nb: { $sum: 1 },
          credit: { $sum: { $cond: [{ $eq: ["$typeVente", "credit"] }, "$montantTotal", 0] } },
        },
      },
    ]),
    Depense.aggregate([
      { $match: { ...base, statut: "validee", dateDepense: dates } },
      { $group: { _id: "$kiosqueId", total: { $sum: "$montant" }, nb: { $sum: 1 } } },
    ]),
    SessionCaisse.aggregate([
      { $match: { ...base, statut: "cloturee", dateOuverture: dates } },
      {
        $group: {
          _id: "$kiosqueId",
          ecartTotal: { $sum: { $abs: { $ifNull: ["$cloture.ecart", 0] } } },
          sessions: { $sum: 1 },
        },
      },
    ]),
  ]);

  const lignes = ids.map((id) => {
    const k = String(id);
    const v = ventes.find((x) => String(x._id) === k);
    const d = depenses.find((x) => String(x._id) === k);
    const e = ecarts.find((x) => String(x._id) === k);
    return {
      kiosqueId: k,
      code: map.get(k)?.code || "",
      designation: map.get(k)?.designation || "Kiosque",
      ca: v?.ca || 0,
      encaisse: v?.encaisse || 0,
      nbVentes: v?.nb || 0,
      caCredit: v?.credit || 0,
      panierMoyen: v?.nb ? Math.round(v.ca / v.nb) : 0,
      depenses: d?.total || 0,
      nbDepenses: d?.nb || 0,
      ecartsCaisse: e?.ecartTotal || 0,
      sessionsCloturees: e?.sessions || 0,
      resultatNet: (v?.encaisse || 0) - (d?.total || 0),
    };
  });
  lignes.sort((a, b) => b.ca - a.ca);
  return { kiosques: lignes };
}

// ============================ RAPPORT DÉPENSES ============================

export async function rapportDepenses(
  user: CurrentUser,
  f: { du?: string; au?: string; kiosqueId?: string }
) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user, f.kiosqueId);
  const match = {
    entrepriseId: eid,
    kiosqueId: { $in: ids },
    statut: "validee",
    dateDepense: plage(f.du, f.au),
  };

  const [parCategorie, parJour, parKiosque, totaux] = await Promise.all([
    Depense.aggregate([
      { $match: match },
      { $group: { _id: "$categorieDepenseId", total: { $sum: "$montant" }, nb: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Depense.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$dateDepense" } },
          total: { $sum: "$montant" },
          nb: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Depense.aggregate([
      { $match: match },
      { $group: { _id: "$kiosqueId", total: { $sum: "$montant" }, nb: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Depense.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: "$montant" }, nb: { $sum: 1 } } }]),
  ]);

  const catsMap = new Map(
    (await CategorieDepense.find({ entrepriseId: eid }).select("code designation").lean()).map((c) => [
      String(c._id),
      c,
    ])
  );

  return {
    parCategorie: parCategorie.map((c) => ({
      categorieId: c._id ? String(c._id) : null,
      designation: c._id ? catsMap.get(String(c._id))?.designation || "—" : "Divers (sans catégorie)",
      total: c.total,
      nb: c.nb,
    })),
    parJour: parJour.map((d) => ({ date: d._id, total: d.total, nb: d.nb })),
    parKiosque: parKiosque.map((k) => ({
      kiosqueId: String(k._id),
      designation: map.get(String(k._id))?.designation || "Kiosque",
      total: k.total,
      nb: k.nb,
    })),
    totaux: { total: totaux[0]?.total || 0, nb: totaux[0]?.nb || 0 },
  };
}

// ============================ RAPPORT CRÉDITS ============================

export async function rapportCredits(user: CurrentUser, f: { kiosqueId?: string }) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user, f.kiosqueId);
  const match = {
    entrepriseId: eid,
    kiosqueId: { $in: ids },
    solde: { $gt: 0 },
    statut: { $ne: "annulee" as const },
  };

  const parClient = await Creance.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$clientId",
        du: { $sum: "$solde" },
        nb: { $sum: 1 },
        plusAncienne: { $min: "$createdAt" },
      },
    },
    { $sort: { du: -1 } },
    { $limit: 50 },
  ]);

  const clientsMap = new Map(
    (
      await Client.find({ _id: { $in: parClient.map((c) => c._id) } })
        .select("code nom prenoms telephone")
        .lean()
    ).map((c) => [String(c._id), c])
  );

  const parKiosque = await Creance.aggregate([
    { $match: match },
    { $group: { _id: "$kiosqueId", du: { $sum: "$solde" }, nb: { $sum: 1 } } },
    { $sort: { du: -1 } },
  ]);

  const totalDu = parClient.reduce((s, c) => s + c.du, 0);
  return {
    parClient: parClient.map((c) => ({
      clientId: String(c._id),
      code: clientsMap.get(String(c._id))?.code || "",
      nomComplet: (() => {
        const cl = clientsMap.get(String(c._id));
        return cl ? [cl.prenoms, cl.nom].filter(Boolean).join(" ").trim() : "Client";
      })(),
      telephone: clientsMap.get(String(c._id))?.telephone || "",
      du: c.du,
      nb: c.nb,
      plusAncienne: c.plusAncienne?.toISOString?.() || null,
    })),
    parKiosque: parKiosque.map((k) => ({
      kiosqueId: String(k._id),
      designation: map.get(String(k._id))?.designation || "Kiosque",
      du: k.du,
      nb: k.nb,
    })),
    totaux: { totalDu, nbCreances: parClient.reduce((s, c) => s + c.nb, 0), nbClients: parClient.length },
  };
}

// ============================ RAPPORT CAISSES ============================

export async function rapportCaisses(
  user: CurrentUser,
  f: { du?: string; au?: string; kiosqueId?: string }
) {
  const eid = oid(user.entrepriseId!);
  const { ids, map } = await perimetre(user, f.kiosqueId);
  const match = {
    entrepriseId: eid,
    kiosqueId: { $in: ids },
    dateOuverture: plage(f.du, f.au),
  };

  const sessions = await SessionCaisse.find(match).sort({ dateOuverture: -1 }).limit(200).lean();
  return {
    sessions: sessions.map((s: any) => ({
      _id: String(s._id),
      numero: s.numero,
      kiosqueId: String(s.kiosqueId),
      kiosqueNom: map.get(String(s.kiosqueId))?.designation || "Kiosque",
      statut: s.statut,
      fondDeCaisse: s.fondDeCaisse,
      ouverteParNom: s.ouverteParNom,
      dateOuverture: s.dateOuverture?.toISOString?.() || null,
      dateCloture: s.cloture?.clotureeLe?.toISOString?.() || null,
      soldeTheorique: s.cloture?.soldeTheorique ?? null,
      montantCompte: s.cloture?.montantCompte ?? null,
      ecart: s.cloture?.ecart ?? null,
      clotureeParNom: s.cloture?.clotureeParNom || null,
    })),
    totaux: {
      sessions: sessions.length,
      cloturees: sessions.filter((s) => s.statut === "cloturee").length,
      ecartTotal: sessions.reduce((s, x: any) => s + Math.abs(x.cloture?.ecart || 0), 0),
    },
  };
}

// ============================ EXPORT EXCEL ============================

import * as XLSX from "xlsx";

/** Export Excel d'un rapport — action `export_donnees` (route). */
export async function exporterRapport(
  user: CurrentUser,
  type: string,
  f: { du?: string; au?: string; kiosqueId?: string }
): Promise<{ buffer: Buffer; nom: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();

  if (type === "ventes") {
    const r = await rapportVentes(user, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parJour.map((j) => ({ Date: j.date, "CA total": j.ca, Comptant: j.comptant, Crédit: j.credit, "Nb ventes": j.nb }))
    ), "Par jour");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parKiosque.map((k) => ({ Kiosque: k.designation, CA: k.ca, Encaissé: k.encaisse, "Nb ventes": k.nbVentes, "Panier moyen": k.panierMoyen }))
    ), "Par kiosque");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parVendeur.map((v) => ({ Vendeur: v.vendeur, CA: v.ca, "Nb ventes": v.nbVentes, "Panier moyen": v.panierMoyen }))
    ), "Par vendeur");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.topProduits.map((p) => ({ Code: p.code, Produit: p.designation, Quantité: p.quantite, Montant: p.montant }))
    ), "Top produits");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parMode.map((m) => ({ Mode: m.mode, Montant: m.montant, "Nb encaissements": m.nb }))
    ), "Par mode de paiement");
    return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, nom: `rapport-ventes-${date}.xlsx` };
  }

  if (type === "depenses") {
    const r = await rapportDepenses(user, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parCategorie.map((c) => ({ Catégorie: c.designation, Montant: c.total, "Nb dépenses": c.nb }))
    ), "Par catégorie");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parJour.map((j) => ({ Date: j.date, Montant: j.total, "Nb dépenses": j.nb }))
    ), "Par jour");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parKiosque.map((k) => ({ Kiosque: k.designation, Montant: k.total, "Nb dépenses": k.nb }))
    ), "Par kiosque");
    return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, nom: `rapport-depenses-${date}.xlsx` };
  }

  if (type === "credits") {
    const r = await rapportCredits(user, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parClient.map((c) => ({
        Code: c.code, Client: c.nomComplet, Téléphone: c.telephone,
        "Montant dû": c.du, "Nb créances": c.nb,
        "Plus ancienne": c.plusAncienne ? c.plusAncienne.slice(0, 10) : "",
      }))
    ), "Par client");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.parKiosque.map((k) => ({ Kiosque: k.designation, "Montant dû": k.du, "Nb créances": k.nb }))
    ), "Par kiosque");
    return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, nom: `rapport-credits-${date}.xlsx` };
  }

  if (type === "kiosques") {
    const r = await comparaisonKiosques(user, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.kiosques.map((k) => ({
        Code: k.code, Kiosque: k.designation, CA: k.ca, Encaissé: k.encaisse,
        "Nb ventes": k.nbVentes, "Panier moyen": k.panierMoyen,
        "CA crédit": k.caCredit, Dépenses: k.depenses, "Résultat net": k.resultatNet,
        "Écarts caisse": k.ecartsCaisse,
      }))
    ), "Comparaison");
    return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, nom: `comparaison-kiosques-${date}.xlsx` };
  }

  if (type === "caisses") {
    const r = await rapportCaisses(user, f);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      r.sessions.map((s) => ({
        Numéro: s.numero, Kiosque: s.kiosqueNom, Statut: s.statut,
        "Fond de caisse": s.fondDeCaisse, "Ouverte par": s.ouverteParNom,
        Ouverture: s.dateOuverture?.slice(0, 16).replace("T", " "),
        Clôture: s.dateCloture?.slice(0, 16).replace("T", " ") || "",
        "Solde théorique": s.soldeTheorique ?? "", "Montant compté": s.montantCompte ?? "",
        Écart: s.ecart ?? "", "Clôturée par": s.clotureeParNom || "",
      }))
    ), "Sessions");
    return { buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer, nom: `rapport-caisses-${date}.xlsx` };
  }

  throw Object.assign(new Error("Type de rapport inconnu"), { status: 400 });
}
