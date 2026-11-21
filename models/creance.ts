import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Créance client — créée à la validation d'une vente à crédit
 * (solde > 0). Suivie dans le module Crédits (Phase 4).
 * Statuts : NON PAYÉ → PARTIELLEMENT PAYÉ → SOLDÉ (ou ANNULÉ).
 */
export interface ICreance extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  clientId: Types.ObjectId;
  venteId: Types.ObjectId;
  numeroVente: string;
  dateVente: Date;
  montantInitial: number;
  montantPaye: number;
  solde: number;
  statut: "non_paye" | "partielle" | "soldee" | "annulee";
  createdAt?: Date;
  updatedAt?: Date;
}

const CreanceSchema = new Schema<ICreance>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", required: true },
    numeroVente: { type: String, required: true },
    dateVente: { type: Date, default: Date.now },
    montantInitial: { type: Number, required: true, min: 0 },
    montantPaye: { type: Number, required: true, min: 0, default: 0 },
    solde: { type: Number, required: true, min: 0 },
    statut: {
      type: String,
      enum: ["non_paye", "partielle", "soldee", "annulee"],
      default: "non_paye",
    },
  },
  { timestamps: true, collection: "creances" }
);

CreanceSchema.index({ entrepriseId: 1, clientId: 1, statut: 1 });
CreanceSchema.index({ entrepriseId: 1, statut: 1, dateVente: -1 });
CreanceSchema.index({ venteId: 1 }, { unique: true });

export const Creance: Model<ICreance> =
  (mongoose.models.Creance as Model<ICreance>) ||
  mongoose.model<ICreance>("Creance", CreanceSchema);
