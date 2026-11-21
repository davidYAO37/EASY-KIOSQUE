import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Encaissement rattaché à une vente (ou à une créance en Phase 4).
 * Une vente peut avoir plusieurs paiements (paiement mixte / partiel).
 * `montantRecu`/`monnaieRendue` ne s'appliquent qu'aux espèces.
 */
export interface IPaiement extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  venteId?: Types.ObjectId | null;
  creanceId?: Types.ObjectId | null;
  type: "encaissement_vente" | "remboursement_creance" | "annulation_vente";
  montant: number;
  mode: string;
  montantRecu?: number;
  monnaieRendue?: number;
  recuPar: Types.ObjectId;
  recuParNom?: string;
  datePaiement: Date;
  statut?: "valide" | "annule";
  createdAt?: Date;
}

const PaiementSchema = new Schema<IPaiement>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", default: null },
    creanceId: { type: Schema.Types.ObjectId, ref: "Creance", default: null },
    type: {
      type: String,
      enum: ["encaissement_vente", "remboursement_creance", "annulation_vente"],
      required: true,
    },
    montant: { type: Number, required: true, min: 0 },
    mode: { type: String, required: true },
    montantRecu: { type: Number },
    monnaieRendue: { type: Number },
    recuPar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recuParNom: { type: String },
    datePaiement: { type: Date, default: Date.now },
    statut: { type: String, enum: ["valide", "annule"], default: "valide" },
  },
  { timestamps: true, collection: "paiements" }
);

PaiementSchema.index({ venteId: 1 });
PaiementSchema.index({ creanceId: 1 });
PaiementSchema.index({ entrepriseId: 1, kiosqueId: 1, datePaiement: -1 });

export const Paiement: Model<IPaiement> =
  (mongoose.models.Paiement as Model<IPaiement>) ||
  mongoose.model<IPaiement>("Paiement", PaiementSchema);
