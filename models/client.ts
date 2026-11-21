import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Client de l'entreprise — fiche obligatoire pour les ventes à crédit
 * (les ventes au comptant peuvent rester sans client : « client de passage »).
 */
export interface IClient extends Document {
  entrepriseId: Types.ObjectId;
  code: string;
  nom: string;
  prenoms?: string;
  telephone?: string;
  adresse?: string;
  plafondCredit?: number | null;
  statut?: "actif" | "inactif";
  createdAt?: Date;
  updatedAt?: Date;
}

const ClientSchema = new Schema<IClient>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    nom: { type: String, required: true },
    prenoms: { type: String },
    telephone: { type: String },
    adresse: { type: String },
    plafondCredit: { type: Number, min: 0, default: null },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
  },
  { timestamps: true, collection: "clients" }
);

ClientSchema.index({ entrepriseId: 1, code: 1 }, { unique: true });
ClientSchema.index({ entrepriseId: 1, telephone: 1 });
ClientSchema.index({ entrepriseId: 1, nom: 1 });

export const Client: Model<IClient> =
  (mongoose.models.Client as Model<IClient>) ||
  mongoose.model<IClient>("Client", ClientSchema);
