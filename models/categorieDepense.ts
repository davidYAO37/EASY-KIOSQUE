import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Catégorie de dépense — typologie des sorties d'argent configurée
 * par le propriétaire (Loyer, Fournisseurs, Transport…).
 */
export interface ICategorieDepense extends Document {
  entrepriseId: Types.ObjectId;
  code: string; // CD###
  designation: string;
  statut: "actif" | "inactif";
  createdAt?: Date;
  updatedAt?: Date;
}

const CategorieDepenseSchema = new Schema<ICategorieDepense>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    code: { type: String, required: true },
    designation: { type: String, required: true, trim: true },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
  },
  { timestamps: true, collection: "categoriesdepenses" }
);

CategorieDepenseSchema.index({ entrepriseId: 1, code: 1 }, { unique: true });
CategorieDepenseSchema.index({ entrepriseId: 1, statut: 1 });

export const CategorieDepense: Model<ICategorieDepense> =
  (mongoose.models.CategorieDepense as Model<ICategorieDepense>) ||
  mongoose.model<ICategorieDepense>("CategorieDepense", CategorieDepenseSchema);
