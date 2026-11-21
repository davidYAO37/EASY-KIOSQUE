import { Types } from "mongoose";
import * as XLSX from "xlsx";
import { Categorie } from "@/models/categorie";
import { Produit } from "@/models/produit";
import { Kiosque } from "@/models/kiosque";
import { Sequence } from "@/models/sequence";
import type {
  CategorieDTO,
  ListeProduits,
  ProduitDTO,
  ResultatImport,
  TypeProduit,
} from "@/types/catalogue";

/**
 * Service métier catalogue — toutes les requêtes sont bornées au tenant
 * (`entrepriseId` résolu depuis la session, passé par la route).
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

// ----------------------------- Catégories -----------------------------

async function codeSuivant(entrepriseId: Types.ObjectId, cle: string, prefixe: string, pad = 3) {
  const seq = await Sequence.findOneAndUpdate(
    { entrepriseId, kiosqueId: null, cle },
    { $inc: { valeur: 1 } },
    { upsert: true, new: true }
  ).lean();
  return `${prefixe}${String(seq?.valeur || 1).padStart(pad, "0")}`;
}

/**
 * Code auto garanti unique : boucle tant que le code généré existe déjà
 * (ex. codes par défaut insérés à l'inscription sans passer par le compteur).
 */
async function codeUnique(
  entrepriseId: Types.ObjectId,
  cle: string,
  prefixe: string,
  pad: number,
  existe: (code: string) => Promise<boolean>
): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = await codeSuivant(entrepriseId, cle, prefixe, pad);
    if (!(await existe(code))) return code;
  }
  throw new Error("Impossible de générer un code unique");
}

const codeCategoriePris = (eid: Types.ObjectId) => (code: string) =>
  Categorie.exists({ entrepriseId: eid, code }).then(Boolean);
const codeProduitPris = (eid: Types.ObjectId) => (code: string) =>
  Produit.exists({ entrepriseId: eid, code }).then(Boolean);

export async function listerCategories(entrepriseId: string): Promise<CategorieDTO[]> {
  const cats = await Categorie.find({ entrepriseId: oid(entrepriseId) })
    .sort({ ordre: 1, libelle: 1 })
    .lean();
  const compteurs = await Produit.aggregate([
    { $match: { entrepriseId: oid(entrepriseId) } },
    { $group: { _id: "$categorieId", n: { $sum: 1 } } },
  ]);
  const parCategorie = new Map(compteurs.map((c) => [String(c._id), c.n]));
  return cats.map((c) => ({
    _id: c._id.toString(),
    code: c.code,
    libelle: c.libelle,
    description: c.description,
    ordre: c.ordre,
    statut: c.statut,
    nbProduits: parCategorie.get(c._id.toString()) || 0,
  }));
}

export async function creerCategorie(entrepriseId: string, data: any) {
  const eid = oid(entrepriseId);
  const code =
    (data.code || "").toUpperCase().trim() ||
    (await codeUnique(eid, "code_categorie", "CAT", 3, codeCategoriePris(eid)));
  const doublon = await Categorie.findOne({ entrepriseId: eid, code }).select("_id").lean();
  if (doublon) {
    const err: any = new Error(`Le code catégorie « ${code} » existe déjà.`);
    err.status = 409;
    throw err;
  }
  const cat = await Categorie.create({
    entrepriseId: eid,
    code,
    libelle: data.libelle,
    description: data.description || undefined,
    ordre: data.ordre ?? 0,
    statut: data.statut || "actif",
  });
  return { ...cat.toObject(), _id: cat._id.toString() };
}

export async function majCategorie(entrepriseId: string, id: string, data: any) {
  const eid = oid(entrepriseId);
  if (data.code) {
    data.code = data.code.toUpperCase().trim();
    const doublon = await Categorie.findOne({
      entrepriseId: eid,
      code: data.code,
      _id: { $ne: oid(id) },
    }).select("_id").lean();
    if (doublon) {
      const err: any = new Error(`Le code catégorie « ${data.code} » existe déjà.`);
      err.status = 409;
      throw err;
    }
  }
  return Categorie.findOneAndUpdate(
    { _id: oid(id), entrepriseId: eid },
    { $set: data },
    { new: true }
  ).lean();
}

/**
 * Suppression : si des produits utilisent la catégorie → désactivation
 * (soft-delete) ; sinon suppression physique.
 */
export async function supprimerCategorie(entrepriseId: string, id: string) {
  const eid = oid(entrepriseId);
  const usage = await Produit.countDocuments({ entrepriseId: eid, categorieId: oid(id) });
  if (usage > 0) {
    const cat = await Categorie.findOneAndUpdate(
      { _id: oid(id), entrepriseId: eid },
      { $set: { statut: "inactif" } },
      { new: true }
    ).lean();
    return { supprimee: false, desactivee: true, usage, categorie: cat };
  }
  const res = await Categorie.deleteOne({ _id: oid(id), entrepriseId: eid });
  return { supprimee: res.deletedCount > 0, desactivee: false, usage: 0 };
}

// ----------------------------- Produits -----------------------------

export interface FiltresProduits {
  q?: string;
  categorieId?: string;
  typeProduit?: string;
  statut?: string;
  page?: number;
  limit?: number;
}

function filtreProduits(entrepriseId: string, f: FiltresProduits) {
  const filtre: any = { entrepriseId: oid(entrepriseId) };
  if (f.q) {
    const r = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtre.$or = [{ designation: r }, { code: r }, { description: r }];
  }
  if (f.categorieId && Types.ObjectId.isValid(f.categorieId)) {
    filtre.categorieId = oid(f.categorieId);
  }
  if (f.typeProduit && ["FABRIQUE", "REVENTE", "MIXTE"].includes(f.typeProduit)) {
    filtre.typeProduit = f.typeProduit;
  }
  if (f.statut === "actif" || f.statut === "inactif") {
    filtre.statut = f.statut;
  }
  return filtre;
}

function versDTO(p: any): ProduitDTO {
  return {
    ...p,
    _id: p._id.toString(),
    categorieId: p.categorieId
      ? typeof p.categorieId === "object" && p.categorieId._id
        ? p.categorieId._id.toString()
        : p.categorieId.toString()
      : null,
    categorie:
      p.categorieId && typeof p.categorieId === "object" && p.categorieId._id
        ? {
            _id: p.categorieId._id.toString(),
            code: p.categorieId.code,
            libelle: p.categorieId.libelle,
          }
        : null,
    prixKiosques: (p.prixKiosques || []).map((pk: any) => ({
      kiosqueId: pk.kiosqueId.toString(),
      prixVente: pk.prixVente,
    })),
  };
}

export async function listerProduits(
  entrepriseId: string,
  f: FiltresProduits
): Promise<ListeProduits> {
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre = filtreProduits(entrepriseId, f);

  const [total, produits] = await Promise.all([
    Produit.countDocuments(filtre),
    Produit.find(filtre)
      .populate("categorieId", "code libelle")
      .sort({ designation: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    produits: produits.map(versDTO),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

/** Valide categorieId + kiosqueIds (appartenance au tenant). */
async function verifierRefs(entrepriseId: string, data: any) {
  const eid = oid(entrepriseId);
  if (data.categorieId) {
    if (!Types.ObjectId.isValid(data.categorieId)) return "Catégorie invalide.";
    const ok = await Categorie.exists({ _id: oid(data.categorieId), entrepriseId: eid });
    if (!ok) return "Catégorie invalide.";
  }
  if (data.prixKiosques?.length) {
    const ids = data.prixKiosques
      .map((p: any) => p.kiosqueId)
      .filter((k: string) => Types.ObjectId.isValid(k));
    const n = await Kiosque.countDocuments({
      _id: { $in: ids.map(oid) },
      entrepriseId: eid,
    });
    if (n !== ids.length) return "Un ou plusieurs kiosques sont invalides.";
  }
  return null;
}

export async function creerProduit(entrepriseId: string, data: any) {
  const eid = oid(entrepriseId);
  const refErr = await verifierRefs(entrepriseId, data);
  if (refErr) {
    const err: any = new Error(refErr);
    err.status = 400;
    throw err;
  }

  const code =
    (data.code || "").toUpperCase().trim() ||
    (await codeUnique(eid, "code_produit", "P", 4, codeProduitPris(eid)));
  const doublon = await Produit.findOne({ entrepriseId: eid, code }).select("_id").lean();
  if (doublon) {
    const err: any = new Error(`Le code produit « ${code} » existe déjà.`);
    err.status = 409;
    throw err;
  }

  const p = await Produit.create({
    entrepriseId: eid,
    code,
    designation: data.designation,
    categorieId: data.categorieId && Types.ObjectId.isValid(data.categorieId)
      ? oid(data.categorieId)
      : null,
    typeProduit: data.typeProduit || "REVENTE",
    prixAchat: data.prixAchat ?? null,
    prixVente: data.prixVente,
    description: data.description || undefined,
    image: data.image || undefined,
    prixKiosques: (data.prixKiosques || []).map((pk: any) => ({
      kiosqueId: oid(pk.kiosqueId),
      prixVente: pk.prixVente,
    })),
    statut: data.statut || "actif",
  });
  return { ...p.toObject(), _id: p._id.toString() };
}

export async function majProduit(entrepriseId: string, id: string, data: any) {
  const eid = oid(entrepriseId);
  const refErr = await verifierRefs(entrepriseId, data);
  if (refErr) {
    const err: any = new Error(refErr);
    err.status = 400;
    throw err;
  }

  const $set: any = { ...data };
  if ($set.code !== undefined) {
    $set.code = $set.code.toUpperCase().trim();
    const doublon = await Produit.findOne({
      entrepriseId: eid,
      code: $set.code,
      _id: { $ne: oid(id) },
    }).select("_id").lean();
    if (doublon) {
      const err: any = new Error(`Le code produit « ${$set.code} » existe déjà.`);
      err.status = 409;
      throw err;
    }
  }
  if ($set.categorieId !== undefined) {
    $set.categorieId = $set.categorieId && Types.ObjectId.isValid($set.categorieId)
      ? oid($set.categorieId)
      : null;
  }
  if ($set.prixKiosques !== undefined) {
    $set.prixKiosques = ($set.prixKiosques || []).map((pk: any) => ({
      kiosqueId: oid(pk.kiosqueId),
      prixVente: pk.prixVente,
    }));
  }
  if ($set.image === "") $set.image = undefined;

  return Produit.findOneAndUpdate(
    { _id: oid(id), entrepriseId: eid },
    { $set },
    { new: true }
  ).lean();
}

/** Désactivation (soft-delete) — conserve l'historique des ventes. */
export async function desactiverProduit(entrepriseId: string, id: string) {
  return Produit.findOneAndUpdate(
    { _id: oid(id), entrepriseId: oid(entrepriseId) },
    { $set: { statut: "inactif" } },
    { new: true }
  ).lean();
}

/** Prix appliqué pour un kiosque donné (surcharge ou prix commun). */
export function prixPourKiosque(produit: any, kiosqueId?: string | null) {
  if (kiosqueId) {
    const pk = (produit.prixKiosques || []).find(
      (p: any) => p.kiosqueId.toString() === String(kiosqueId)
    );
    if (pk) return pk.prixVente;
  }
  return produit.prixVente;
}

// --------------------------- Import / Export Excel ---------------------------

const norm = (s: any) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

const CLES: Record<string, string[]> = {
  code: ["code", "codeproduit", "ref", "reference"],
  designation: ["designation", "libelle", "produit", "nom"],
  categorie: ["categorie", "famille"],
  type: ["type", "typeproduit"],
  prixAchat: ["prixachat", "prixdachat", "achat"],
  prixVente: ["prixvente", "prixdevente", "vente", "prix"],
  description: ["description", "desc"],
};

function lireColonne(row: Record<string, any>, cle: string) {
  for (const alias of CLES[cle]) {
    if (row[alias] !== undefined && row[alias] !== "") return row[alias];
  }
  return undefined;
}

/**
 * Import Excel (.xlsx) — colonnes attendues :
 * Code | Désignation | Catégorie | Type | Prix achat | Prix vente | Description
 * Upsert par code produit ; les catégories manquantes sont créées.
 */
export async function importerProduits(
  entrepriseId: string,
  buffer: Buffer
): Promise<ResultatImport> {
  const eid = oid(entrepriseId);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const brut: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const lignes = brut.map((r) => {
    const normRow: Record<string, any> = {};
    for (const k of Object.keys(r)) normRow[norm(k)] = r[k];
    return normRow;
  });

  const res: ResultatImport = { crees: 0, majs: 0, erreurs: [] };
  const categories = new Map<string, Types.ObjectId>();

  for (let i = 0; i < lignes.length; i++) {
    const noLigne = i + 2; // +1 pour l'entête Excel
    try {
      const row = lignes[i];
      const designation = String(lireColonne(row, "designation") ?? "").trim();
      if (!designation) {
        res.erreurs.push({ ligne: noLigne, message: "Désignation manquante" });
        continue;
      }
      const prixVente = Number(lireColonne(row, "prixVente"));
      if (!Number.isFinite(prixVente) || prixVente < 0) {
        res.erreurs.push({ ligne: noLigne, message: "Prix de vente invalide" });
        continue;
      }
      const prixAchatBrut = lireColonne(row, "prixAchat");
      const prixAchat =
        prixAchatBrut === undefined || prixAchatBrut === ""
          ? null
          : Number(prixAchatBrut);
      if (prixAchat !== null && (!Number.isFinite(prixAchat) || prixAchat < 0)) {
        res.erreurs.push({ ligne: noLigne, message: "Prix d'achat invalide" });
        continue;
      }
      let typeProduit = String(lireColonne(row, "type") ?? "REVENTE")
        .toUpperCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim() as TypeProduit;
      if (!["FABRIQUE", "REVENTE", "MIXTE"].includes(typeProduit)) typeProduit = "REVENTE";

      // Catégorie : recherche par libellé (insensible à la casse) ou création
      let categorieId: Types.ObjectId | null = null;
      const nomCat = String(lireColonne(row, "categorie") ?? "").trim();
      if (nomCat) {
        const cle = nomCat.toLowerCase();
        if (categories.has(cle)) {
          categorieId = categories.get(cle)!;
        } else {
          const existante = await Categorie.findOne({
            entrepriseId: eid,
            libelle: new RegExp(`^${nomCat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
          }).lean();
          if (existante) {
            categorieId = existante._id as Types.ObjectId;
          } else {
            const code = await codeUnique(eid, "code_categorie", "CAT", 3, codeCategoriePris(eid));
            const c = await Categorie.create({
              entrepriseId: eid,
              code,
              libelle: nomCat,
              statut: "actif",
            });
            categorieId = c._id as Types.ObjectId;
          }
          categories.set(cle, categorieId);
        }
      }

      let code = String(lireColonne(row, "code") ?? "").toUpperCase().trim();
      if (!code) code = await codeUnique(eid, "code_produit", "P", 4, codeProduitPris(eid));

      const donnees = {
        designation,
        categorieId,
        typeProduit,
        prixAchat,
        prixVente,
        description: String(lireColonne(row, "description") ?? "").trim() || undefined,
      };

      const existant = await Produit.findOne({ entrepriseId: eid, code }).select("_id").lean();
      if (existant) {
        await Produit.updateOne({ _id: existant._id }, { $set: donnees });
        res.majs++;
      } else {
        await Produit.create({ entrepriseId: eid, code, ...donnees, statut: "actif" });
        res.crees++;
      }
    } catch (e: any) {
      res.erreurs.push({ ligne: noLigne, message: e?.message || "Erreur" });
    }
  }
  return res;
}

/** Export Excel du catalogue (mêmes filtres que la liste). */
export async function exporterProduits(
  entrepriseId: string,
  f: FiltresProduits
): Promise<Buffer> {
  const filtre = filtreProduits(entrepriseId, f);
  const produits = await Produit.find(filtre)
    .populate("categorieId", "libelle")
    .sort({ code: 1 })
    .lean();

  const lignes = produits.map((p: any) => ({
    Code: p.code,
    "Désignation": p.designation,
    "Catégorie": p.categorieId?.libelle || "",
    Type: p.typeProduit,
    "Prix achat": p.prixAchat ?? "",
    "Prix vente": p.prixVente,
    Description: p.description || "",
    Statut: p.statut || "actif",
  }));

  const ws = XLSX.utils.json_to_sheet(lignes);
  ws["!cols"] = [
    { wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Produits");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
