import { Types, type ClientSession } from "mongoose";
import { Entreprise } from "@/models/entreprise";
import { Produit } from "@/models/produit";
import { StockKiosque } from "@/models/stockKiosque";
import { MouvementStock } from "@/models/mouvementStock";
import { JournalActivite } from "@/models/journalActivite";
import { exigerKiosque, kiosquesAutorises } from "@/lib/tenant";
import { avecTransaction } from "@/lib/transaction";
import type { CurrentUser } from "@/lib/auth";

/**
 * Service stock — suivi par kiosque des produits REVENTE uniquement.
 *
 * RÈGLES :
 * - Le réglage vit dans `Entreprise.stock` : `actif` active le suivi ;
 *   `venteSansStockAutorisee` décide si une vente peut passer en rupture
 *   (stock négatif toléré) ou si elle est bloquée (STOCK_INSUFFISANT).
 * - Les sorties de vente et les restitutions d'annulation sont appelées
 *   par `ventes.service` DANS la même transaction que la vente —
 *   jamais de vente validée sans son mouvement de stock.
 * - Historique immuable : chaque variation écrit un `MouvementStock`
 *   (avant/après figés) ; aucune suppression.
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

// ----------------------------- Réglage -----------------------------

export interface ConfigStock {
  actif: boolean;
  venteSansStockAutorisee: boolean;
}

/** Réglage stock de l'entreprise (défaut : inactif, rupture tolérée). */
export async function configStock(eid: Types.ObjectId): Promise<ConfigStock> {
  const ent = await Entreprise.findById(eid).select("stock").lean();
  return {
    actif: !!ent?.stock?.actif,
    venteSansStockAutorisee: ent?.stock?.venteSansStockAutorisee !== false,
  };
}

// ----------------------------- Lecture -----------------------------

export interface NiveauStockDTO {
  produitId: string;
  code: string;
  designation: string;
  prixAchat: number | null;
  seuilAlerte: number | null;
  kiosqueId: string;
  kiosqueNom: string;
  quantite: number;
  rupture: boolean;
  sousSeuil: boolean;
  valorisation: number;
}

/**
 * Niveaux de stock : croisement produits REVENTE actifs × kiosques
 * accessibles par l'utilisateur. Un produit jamais approvisionné
 * apparaît à 0 — le propriétaire voit ce qui doit être entré.
 */
export async function listerNiveaux(
  user: CurrentUser,
  f: { kiosqueId?: string; q?: string } = {}
): Promise<{ stockActif: boolean; venteSansStockAutorisee: boolean; niveaux: NiveauStockDTO[] }> {
  const eid = oid(user.entrepriseId!);
  const cfg = await configStock(eid);

  let kiosques = await kiosquesAutorises(user);
  kiosques = kiosques.filter((k: any) => k.statut !== "inactif");
  if (f.kiosqueId) {
    if (!Types.ObjectId.isValid(f.kiosqueId)) errHttp("Kiosque invalide.", 400);
    kiosques = kiosques.filter((k: any) => String(k._id) === f.kiosqueId);
    if (!kiosques.length) errHttp("Kiosque introuvable ou non autorisé.", 404, "KIOSQUE_INVALIDE");
  }

  const filtreProduit: any = { entrepriseId: eid, typeProduit: "REVENTE", statut: "actif" };
  if (f.q) {
    filtreProduit.$or = [
      { designation: { $regex: f.q, $options: "i" } },
      { code: { $regex: f.q, $options: "i" } },
    ];
  }
  const produits = await Produit.find(filtreProduit)
    .select("code designation prixAchat seuilAlerte")
    .sort({ designation: 1 })
    .lean();

  const lignes = await StockKiosque.find({
    entrepriseId: eid,
    kiosqueId: { $in: kiosques.map((k: any) => k._id) },
    produitId: { $in: produits.map((p) => p._id) },
  }).lean();
  const parCle = new Map(lignes.map((s) => [`${s.kiosqueId}:${s.produitId}`, s.quantite]));

  const niveaux: NiveauStockDTO[] = [];
  for (const k of kiosques) {
    for (const p of produits) {
      const quantite = parCle.get(`${k._id}:${p._id}`) ?? 0;
      const seuil = p.seuilAlerte ?? null;
      niveaux.push({
        produitId: p._id.toString(),
        code: p.code,
        designation: p.designation,
        prixAchat: p.prixAchat ?? null,
        seuilAlerte: seuil,
        kiosqueId: (k as any)._id.toString(),
        kiosqueNom: (k as any).designation,
        quantite,
        rupture: quantite <= 0,
        sousSeuil: seuil != null && quantite <= seuil,
        valorisation: (p.prixAchat ?? 0) * quantite,
      });
    }
  }
  return { stockActif: cfg.actif, venteSansStockAutorisee: cfg.venteSansStockAutorisee, niveaux };
}

export interface FiltresMouvements {
  kiosqueId?: string;
  produitId?: string;
  du?: string;
  au?: string;
  page?: number;
  limit?: number;
}

export async function listerMouvements(user: CurrentUser, f: FiltresMouvements) {
  const eid = oid(user.entrepriseId!);
  const filtre: any = { entrepriseId: eid };

  const kiosques = await kiosquesAutorises(user);
  const autorises = kiosques.map((k: any) => k._id);
  if (f.kiosqueId) {
    if (!Types.ObjectId.isValid(f.kiosqueId)) errHttp("Kiosque invalide.", 400);
    if (!autorises.some((id: any) => String(id) === f.kiosqueId)) {
      errHttp("Kiosque introuvable ou non autorisé.", 404, "KIOSQUE_INVALIDE");
    }
    filtre.kiosqueId = oid(f.kiosqueId);
  } else {
    filtre.kiosqueId = { $in: autorises };
  }
  if (f.produitId) {
    if (!Types.ObjectId.isValid(f.produitId)) errHttp("Produit invalide.", 400);
    filtre.produitId = oid(f.produitId);
  }
  if (f.du || f.au) {
    filtre.createdAt = {};
    if (f.du) filtre.createdAt.$gte = new Date(`${f.du}T00:00:00`);
    if (f.au) filtre.createdAt.$lte = new Date(`${f.au}T23:59:59.999`);
  }

  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, f.limit || 30);
  const [total, mouvements] = await Promise.all([
    MouvementStock.countDocuments(filtre),
    MouvementStock.find(filtre)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    mouvements: mouvements.map((m: any) => ({ ...m, _id: m._id.toString() })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ----------------------------- Écritures -----------------------------

async function exigerProduitSuivi(eid: Types.ObjectId, produitId: string) {
  if (!Types.ObjectId.isValid(produitId)) errHttp("Produit invalide.", 400, "PRODUIT_INVALIDE");
  const p = await Produit.findOne({ _id: oid(produitId), entrepriseId: eid }).lean();
  if (!p || p.statut !== "actif") errHttp("Produit introuvable ou inactif.", 404, "PRODUIT_INVALIDE");
  if (p!.typeProduit !== "REVENTE") {
    errHttp(
      `« ${p!.designation} » n'est pas un produit de revente — le stock ne suit que les REVENTE.`,
      400,
      "PRODUIT_NON_SUIVI"
    );
  }
  return p!;
}

/** Applique une variation signée + mouvement tracé (dans une transaction). */
async function appliquerVariation(
  params: {
    eid: Types.ObjectId;
    kiosqueId: Types.ObjectId;
    produit: { _id: Types.ObjectId; code: string; designation: string };
    delta: number;
    type: "entree" | "vente" | "annulation_vente" | "ajustement";
    motif?: string;
    venteId?: Types.ObjectId | null;
    venteNumero?: string;
    userId: Types.ObjectId;
    userNom: string;
  },
  session?: ClientSession
) {
  const { eid, kiosqueId, produit, delta } = params;
  const filtre = { entrepriseId: eid, kiosqueId, produitId: produit._id };
  const avant =
    (await StockKiosque.findOne(filtre).session(session ?? null).lean())?.quantite ?? 0;
  const apres = avant + delta;

  await StockKiosque.updateOne(
    filtre,
    { $inc: { quantite: delta }, $setOnInsert: { entrepriseId: eid, kiosqueId, produitId: produit._id } },
    { upsert: true, session }
  );
  await MouvementStock.create(
    [
      {
        entrepriseId: eid,
        kiosqueId,
        produitId: produit._id,
        produitCode: produit.code,
        produitDesignation: produit.designation,
        type: params.type,
        quantite: delta,
        avant,
        apres,
        motif: params.motif || undefined,
        venteId: params.venteId ?? null,
        venteNumero: params.venteNumero,
        userId: params.userId,
        userNom: params.userNom,
      },
    ],
    { session }
  );
  return { avant, apres };
}

/** Entrée de stock (approvisionnement) — action `gestion_stock`. */
export async function entreeStock(
  user: CurrentUser,
  data: { kiosqueId: string; produitId: string; quantite: number; motif?: string }
) {
  const eid = oid(user.entrepriseId!);
  const cfg = await configStock(eid);
  if (!cfg.actif) {
    errHttp("La gestion de stock n'est pas activée — voir Paramètres → Entreprise.", 400, "STOCK_INACTIF");
  }
  const kiosque = await exigerKiosque(user, data.kiosqueId);
  if (kiosque.statut === "inactif") errHttp("Ce kiosque est désactivé.", 400, "KIOSQUE_INACTIF");
  const produit = await exigerProduitSuivi(eid, data.produitId);
  const auteurNom = nomComplet(user);

  let resultat: { avant: number; apres: number } | undefined;
  await avecTransaction(async (session) => {
    resultat = await appliquerVariation(
      {
        eid,
        kiosqueId: kiosque._id,
        produit: produit as any,
        delta: data.quantite,
        type: "entree",
        motif: data.motif,
        userId: oid(user._id),
        userNom: auteurNom,
      },
      session
    );
  });

  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "stock_entree",
    module: "stock",
    details: {
      produitId: produit._id.toString(),
      produit: produit.designation,
      quantite: data.quantite,
      avant: resultat!.avant,
      apres: resultat!.apres,
      motif: data.motif,
    },
  });
  return { produitId: produit._id.toString(), kiosqueId: kiosque._id.toString(), ...resultat! };
}

/** Ajustement motivé : fixe le niveau au stock réel compté (delta tracé). */
export async function ajusterStock(
  user: CurrentUser,
  data: { kiosqueId: string; produitId: string; nouvelleQuantite: number; motif: string }
) {
  const eid = oid(user.entrepriseId!);
  const cfg = await configStock(eid);
  if (!cfg.actif) {
    errHttp("La gestion de stock n'est pas activée — voir Paramètres → Entreprise.", 400, "STOCK_INACTIF");
  }
  const kiosque = await exigerKiosque(user, data.kiosqueId);
  const produit = await exigerProduitSuivi(eid, data.produitId);
  const auteurNom = nomComplet(user);

  let resultat: { avant: number; apres: number } | undefined;
  await avecTransaction(async (session) => {
    const filtre = { entrepriseId: eid, kiosqueId: kiosque._id, produitId: produit._id };
    const avant =
      (await StockKiosque.findOne(filtre).session(session ?? null).lean())?.quantite ?? 0;
    const delta = data.nouvelleQuantite - avant;
    if (delta === 0) {
      resultat = { avant, apres: avant };
      return;
    }
    resultat = await appliquerVariation(
      {
        eid,
        kiosqueId: kiosque._id,
        produit: produit as any,
        delta,
        type: "ajustement",
        motif: data.motif,
        userId: oid(user._id),
        userNom: auteurNom,
      },
      session
    );
  });

  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: oid(user._id),
    action: "stock_ajustement",
    module: "stock",
    details: {
      produitId: produit._id.toString(),
      produit: produit.designation,
      avant: resultat!.avant,
      apres: resultat!.apres,
      motif: data.motif,
    },
  });
  return { produitId: produit._id.toString(), kiosqueId: kiosque._id.toString(), ...resultat! };
}

// --------------------- Fiches collectives (multi-lignes) ---------------------

interface ContexteStock {
  eid: Types.ObjectId;
  kiosque: { _id: Types.ObjectId; statut?: string };
  auteurId: Types.ObjectId;
  auteurNom: string;
}

async function contexteStock(user: CurrentUser, kiosqueId: string): Promise<ContexteStock> {
  const eid = oid(user.entrepriseId!);
  const cfg = await configStock(eid);
  if (!cfg.actif) {
    errHttp("La gestion de stock n'est pas activée — voir Paramètres → Entreprise.", 400, "STOCK_INACTIF");
  }
  const kiosque = await exigerKiosque(user, kiosqueId);
  if (kiosque.statut === "inactif") errHttp("Ce kiosque est désactivé.", 400, "KIOSQUE_INACTIF");
  return { eid, kiosque, auteurId: oid(user._id), auteurNom: nomComplet(user) };
}

/**
 * Fiche d'entrée collective : toutes les lignes sont validées AVANT la
 * transaction (produit suivi, quantités), puis appliquées en une seule
 * transaction — jamais de demi-fiche.
 */
export async function entreesStock(
  user: CurrentUser,
  data: { kiosqueId: string; motif?: string; lignes: { produitId: string; quantite: number }[] }
) {
  const { eid, kiosque, auteurId, auteurNom } = await contexteStock(user, data.kiosqueId);

  // Agrège les doublons éventuels et valide chaque produit AVANT la transaction
  const parProduit = new Map<string, number>();
  for (const l of data.lignes) {
    parProduit.set(l.produitId, (parProduit.get(l.produitId) || 0) + l.quantite);
  }
  const produits = new Map<string, any>();
  for (const pid of parProduit.keys()) {
    produits.set(pid, await exigerProduitSuivi(eid, pid));
  }

  const resultats: { produitId: string; produit: string; avant: number; apres: number }[] = [];
  await avecTransaction(async (session) => {
    for (const [pid, quantite] of parProduit) {
      const produit = produits.get(pid)!;
      const r = await appliquerVariation(
        {
          eid,
          kiosqueId: kiosque._id,
          produit: produit as any,
          delta: quantite,
          type: "entree",
          motif: data.motif,
          userId: auteurId,
          userNom: auteurNom,
        },
        session
      );
      resultats.push({ produitId: pid, produit: produit.designation, ...r });
    }
  });

  await JournalActivite.create({
    entrepriseId: eid,
    kiosqueId: kiosque._id,
    userId: auteurId,
    action: "stock_entrees_fiche",
    module: "stock",
    details: {
      motif: data.motif,
      nbLignes: resultats.length,
      lignes: resultats.map((r) => ({ produit: r.produit, apres: r.apres })),
    },
  });
  return { kiosqueId: kiosque._id.toString(), lignes: resultats };
}

/**
 * Fiche d'ajustement collective (inventaire) : chaque ligne fixe le stock
 * au niveau réel compté ; les lignes inchangées (delta = 0) ne produisent
 * aucun mouvement.
 */
export async function ajustementsStock(
  user: CurrentUser,
  data: { kiosqueId: string; motif: string; lignes: { produitId: string; nouvelleQuantite: number }[] }
) {
  const { eid, kiosque, auteurId, auteurNom } = await contexteStock(user, data.kiosqueId);

  const produits = new Map<string, any>();
  const vus = new Set<string>();
  for (const l of data.lignes) {
    if (vus.has(l.produitId)) errHttp(`Produit en double dans la fiche.`, 400);
    vus.add(l.produitId);
    produits.set(l.produitId, await exigerProduitSuivi(eid, l.produitId));
  }

  const resultats: { produitId: string; produit: string; avant: number; apres: number }[] = [];
  await avecTransaction(async (session) => {
    for (const l of data.lignes) {
      const produit = produits.get(l.produitId)!;
      const filtre = { entrepriseId: eid, kiosqueId: kiosque._id, produitId: produit._id };
      const avant =
        (await StockKiosque.findOne(filtre).session(session ?? null).lean())?.quantite ?? 0;
      const delta = l.nouvelleQuantite - avant;
      if (delta === 0) continue;
      const r = await appliquerVariation(
        {
          eid,
          kiosqueId: kiosque._id,
          produit: produit as any,
          delta,
          type: "ajustement",
          motif: data.motif,
          userId: auteurId,
          userNom: auteurNom,
        },
        session
      );
      resultats.push({ produitId: l.produitId, produit: produit.designation, ...r });
    }
  });

  if (resultats.length > 0) {
    await JournalActivite.create({
      entrepriseId: eid,
      kiosqueId: kiosque._id,
      userId: auteurId,
      action: "stock_ajustements_fiche",
      module: "stock",
      details: {
        motif: data.motif,
        nbLignes: resultats.length,
        lignes: resultats.map((r) => ({ produit: r.produit, avant: r.avant, apres: r.apres })),
      },
    });
  }
  return { kiosqueId: kiosque._id.toString(), modifiees: resultats.length, lignes: resultats };
}

// --------------------- Hooks ventes (dans la transaction) ---------------------

interface LigneAvecProduit {
  produitId: Types.ObjectId;
  quantite: number;
  typeProduit?: string;
}

/**
 * Sorties de stock d'une vente — APPELÉE DANS la transaction de vente.
 * Agrège par produit, vérifie la disponibilité si l'entreprise bloque
 * les ventes sans stock, puis décrémente + trace.
 */
export async function sortiesStockVente(
  params: {
    eid: Types.ObjectId;
    kiosqueId: Types.ObjectId;
    lignes: LigneAvecProduit[];
    produitsParId: Map<string, { code: string; designation: string; typeProduit: string }>;
    cfg: ConfigStock;
    venteId: Types.ObjectId;
    numeroVente: string;
    userId: Types.ObjectId;
    userNom: string;
  },
  session?: ClientSession
) {
  if (!params.cfg.actif) return;

  // Agrégation défensive par produit (un produit ne devrait apparaître
  // qu'une fois, mais on ne fait pas confiance à la forme du panier)
  const parProduit = new Map<string, number>();
  for (const l of params.lignes) {
    const p = params.produitsParId.get(l.produitId.toString());
    if (p?.typeProduit !== "REVENTE") continue;
    parProduit.set(l.produitId.toString(), (parProduit.get(l.produitId.toString()) || 0) + l.quantite);
  }

  for (const [pid, qte] of parProduit) {
    const produit = params.produitsParId.get(pid)!;
    const filtre = { entrepriseId: params.eid, kiosqueId: params.kiosqueId, produitId: oid(pid) };
    const avant =
      (await StockKiosque.findOne(filtre).session(session ?? null).lean())?.quantite ?? 0;

    if (!params.cfg.venteSansStockAutorisee && avant < qte) {
      errHttp(
        `Stock insuffisant pour « ${produit.designation} » — ${avant} disponible(s), ${qte} demandé(s).`,
        400,
        "STOCK_INSUFFISANT"
      );
    }
    await appliquerVariation(
      {
        eid: params.eid,
        kiosqueId: params.kiosqueId,
        produit: { _id: oid(pid), code: produit.code, designation: produit.designation },
        delta: -qte,
        type: "vente",
        venteId: params.venteId,
        venteNumero: params.numeroVente,
        userId: params.userId,
        userNom: params.userNom,
      },
      session
    );
  }
}

/**
 * Restitution de stock à l'annulation d'une vente — dans la même
 * transaction : chaque produit REVENTE revient dans le kiosque.
 */
export async function retoursStockAnnulation(
  params: {
    eid: Types.ObjectId;
    kiosqueId: Types.ObjectId;
    lignes: LigneAvecProduit[];
    venteId: Types.ObjectId;
    numeroVente: string;
    userId: Types.ObjectId;
    userNom: string;
  },
  session?: ClientSession
) {
  const cfg = await configStock(params.eid);
  if (!cfg.actif) return;

  for (const l of params.lignes) {
    if (l.typeProduit !== "REVENTE") continue;
    const produit = await Produit.findById(l.produitId).select("code designation").lean();
    if (!produit) continue;
    await appliquerVariation(
      {
        eid: params.eid,
        kiosqueId: params.kiosqueId,
        produit: { _id: l.produitId, code: produit.code, designation: produit.designation },
        delta: l.quantite,
        type: "annulation_vente",
        venteId: params.venteId,
        venteNumero: params.numeroVente,
        userId: params.userId,
        userNom: params.userNom,
      },
      session
    );
  }
}
