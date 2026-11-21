import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Kiosque / point de vente d'une entreprise.
 * Chaque kiosque a ses propres utilisateurs affectés, ventes et caisses.
 */
export interface IKiosque extends Document {
  entrepriseId: Types.ObjectId;
  code: string;
  designation: string;
  adresse?: string;
  telephone?: string;
  responsable?: string;
  dateOuverture?: Date;
  statut?: "actif" | "inactif";
  createdAt?: Date;
  updatedAt?: Date;
}

const KiosqueSchema = new Schema<IKiosque>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    designation: { type: String, required: true },
    adresse: { type: String },
    telephone: { type: String },
    responsable: { type: String },
    dateOuverture: { type: Date, default: Date.now },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
  },
  { timestamps: true, collection: "kiosques" }
);

// Code unique dans le périmètre de l'entreprise
KiosqueSchema.index({ entrepriseId: 1, code: 1 }, { unique: true });
KiosqueSchema.index({ entrepriseId: 1, statut: 1 });

export const Kiosque: Model<IKiosque> =
  (mongoose.models.Kiosque as Model<IKiosque>) ||
  mongoose.model<IKiosque>("Kiosque", KiosqueSchema);
