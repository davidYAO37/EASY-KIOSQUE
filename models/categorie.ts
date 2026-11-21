import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Catégorie de produits, propre à chaque entreprise
 * (ex. « Plats préparés », « Boissons », « Biscuits & Confiserie »).
 */
export interface ICategorie extends Document {
  entrepriseId: Types.ObjectId;
  code: string;
  libelle: string;
  description?: string;
  ordre?: number;
  statut?: "actif" | "inactif";
  createdAt?: Date;
  updatedAt?: Date;
}

const CategorieSchema = new Schema<ICategorie>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    libelle: { type: String, required: true },
    description: { type: String },
    ordre: { type: Number, default: 0 },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
  },
  { timestamps: true, collection: "categories" }
);

// Code unique dans le périmètre de l'entreprise
CategorieSchema.index({ entrepriseId: 1, code: 1 }, { unique: true });
CategorieSchema.index({ entrepriseId: 1, libelle: 1 });
CategorieSchema.index({ entrepriseId: 1, statut: 1, ordre: 1 });

export const Categorie: Model<ICategorie> =
  (mongoose.models.Categorie as Model<ICategorie>) ||
  mongoose.model<ICategorie>("Categorie", CategorieSchema);
