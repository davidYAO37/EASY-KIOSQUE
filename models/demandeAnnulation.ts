import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Demande d'annulation d'une vente — workflow vendeur → validateur.
 *
 * Un opérateur sans l'action `annuler_vente` (vendeur, caissier...)
 * demande l'annulation avec motif ; un utilisateur autorisé valide
 * (l'annulation réelle passe par `annulerVente`, tracée) ou rejette.
 * Historisée : demandeur, dates, validateur et motif de rejet conservés.
 */
export interface IDemandeAnnulation extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  venteId: Types.ObjectId;
  numeroVente: string;
  montantTotal: number;
  dateVente?: Date;
  demandeurId: Types.ObjectId;
  demandeurNom: string;
  motif: string;
  statut: "en_attente" | "approuvee" | "rejetee";
  traiteLe?: Date | null;
  traiteParId?: Types.ObjectId | null;
  traiteParNom?: string | null;
  motifRejet?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const DemandeAnnulationSchema = new Schema<IDemandeAnnulation>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", required: true },
    numeroVente: { type: String, required: true },
    montantTotal: { type: Number, required: true, min: 0 },
    dateVente: { type: Date },
    demandeurId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    demandeurNom: { type: String, required: true },
    motif: { type: String, required: true },
    statut: {
      type: String,
      enum: ["en_attente", "approuvee", "rejetee"],
      default: "en_attente",
    },
    traiteLe: { type: Date, default: null },
    traiteParId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    traiteParNom: { type: String, default: null },
    motifRejet: { type: String, default: null },
  },
  { timestamps: true, collection: "demandesannulations" }
);

DemandeAnnulationSchema.index({ entrepriseId: 1, statut: 1, createdAt: -1 });
DemandeAnnulationSchema.index({ entrepriseId: 1, demandeurId: 1, createdAt: -1 });
// Une seule demande en attente par vente (doublon → 11000 → 409)
DemandeAnnulationSchema.index(
  { entrepriseId: 1, venteId: 1 },
  { unique: true, partialFilterExpression: { statut: "en_attente" } }
);

export const DemandeAnnulation: Model<IDemandeAnnulation> =
  (mongoose.models.DemandeAnnulation as Model<IDemandeAnnulation>) ||
  mongoose.model<IDemandeAnnulation>("DemandeAnnulation", DemandeAnnulationSchema);
