import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Plan d'abonnement SaaS proposé par la plateforme (ESSAI, KIOSQUE,
 * ENTREPRISE...). `maxKiosques`/`maxUtilisateurs` = 0 → illimité.
 * Géré exclusivement par le super-admin.
 */
export interface IPlan extends Document {
  code: string;
  nom: string;
  prixMensuel: number;
  dureeEssaiJours?: number;
  maxKiosques: number;
  maxUtilisateurs: number;
  description?: string;
  statut: "actif" | "inactif";
  /** Mis en avant sur la page d'accueil (badge « populaire »). */
  vedette?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const PlanSchema = new Schema<IPlan>(
  {
    code: { type: String, required: true, unique: true, uppercase: true },
    nom: { type: String, required: true },
    prixMensuel: { type: Number, required: true, min: 0 },
    dureeEssaiJours: { type: Number, default: 0 },
    maxKiosques: { type: Number, default: 1 },
    maxUtilisateurs: { type: Number, default: 3 },
    description: { type: String },
    statut: { type: String, enum: ["actif", "inactif"], default: "actif" },
    vedette: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "plans" }
);

export const Plan: Model<IPlan> =
  (mongoose.models.Plan as Model<IPlan>) ||
  mongoose.model<IPlan>("Plan", PlanSchema);
