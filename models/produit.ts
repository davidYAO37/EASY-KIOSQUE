import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type TypeProduit = "FABRIQUE" | "REVENTE" | "MIXTE";

/**
 * Produit du catalogue (multi-tenant).
 *
 * - `prixAchat` : indicatif, facultatif — NE déclenche AUCUNE gestion
 *   de stock (interdit en V1).
 * - `prixVente` : prix commun à l'entreprise.
 * - `prixKiosques` : surcharges de prix par kiosque ; le prix réellement
 *   appliqué est recopié dans chaque ligne de vente (module Ventes).
 */
export interface IPrixKiosque {
  kiosqueId: Types.ObjectId;
  prixVente: number;
}

export interface IProduit extends Document {
  entrepriseId: Types.ObjectId;
  code: string;
  /** Code-barres (EAN-13/EAN-8 ou interne) — unique par entreprise, sert au scan en vente. */
  codeBarre?: string;
  designation: string;
  categorieId?: Types.ObjectId | null;
  typeProduit: TypeProduit;
  prixAchat?: number | null;
  prixVente: number;
  /** Seuil d'alerte stock bas (produits REVENTE, si stock activé). */
  seuilAlerte?: number | null;
  description?: string;
  image?: string; // data URI ≤ ~500 Ko
  prixKiosques?: IPrixKiosque[];
  statut?: "actif" | "inactif";
  createdAt?: Date;
  updatedAt?: Date;
}

const PrixKiosqueSchema = new Schema<IPrixKiosque>(
  {
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    prixVente: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const ProduitSchema = new Schema<IProduit>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    codeBarre: { type: String, trim: true },
    designation: { type: String, required: true },
    categorieId: { type: Schema.Types.ObjectId, ref: "Categorie", default: null },
    typeProduit: {
      type: String,
      enum: ["FABRIQUE", "REVENTE", "MIXTE"],
      default: "REVENTE",
      required: true,
    },
    prixAchat: { type: Number, min: 0, default: null },
    prixVente: { type: Number, required: true, min: 0 },
    seuilAlerte: { type: Number, min: 0, default: null },
    description: { type: String },
    image: { type: String },
    prixKiosques: { type: [PrixKiosqueSchema], default: undefined },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
  },
  { timestamps: true, collection: "produits" }
);

// Code unique dans le périmètre de l'entreprise
ProduitSchema.index({ entrepriseId: 1, code: 1 }, { unique: true });
ProduitSchema.index({ entrepriseId: 1, categorieId: 1 });
ProduitSchema.index({ entrepriseId: 1, statut: 1, designation: 1 });
ProduitSchema.index({ entrepriseId: 1, typeProduit: 1 });
// Lookup exact du scan POS ; l'unicité par entreprise est contrôlée dans le service.
ProduitSchema.index({ entrepriseId: 1, codeBarre: 1 });

export const Produit: Model<IProduit> =
  (mongoose.models.Produit as Model<IProduit>) ||
  mongoose.model<IProduit>("Produit", ProduitSchema);
