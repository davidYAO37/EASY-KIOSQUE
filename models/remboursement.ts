import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Remboursement client — encaissement d'une créance (total ou partiel).
 * Un remboursement peut solder plusieurs ventes : `allocations` conserve
 * la ventilation exacte par créance (traçabilité complète).
 * Jamais supprimé : les corrections passent par une opération inverse tracée.
 */
export interface IAllocationRemboursement {
  creanceId: Types.ObjectId;
  venteId: Types.ObjectId;
  numeroVente: string;
  montant: number;
}

export interface IRemboursement extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  clientId: Types.ObjectId;
  clientNom?: string;
  numero: string;
  datePaiement: Date;
  montantTotal: number;
  mode: string;
  reference?: string;
  allocations: IAllocationRemboursement[];
  recuPar: Types.ObjectId;
  recuParNom?: string;
  idempotencyKey?: string;
  statut?: "valide" | "annule";
  createdAt?: Date;
}

const AllocationSchema = new Schema<IAllocationRemboursement>(
  {
    creanceId: { type: Schema.Types.ObjectId, ref: "Creance", required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", required: true },
    numeroVente: { type: String, required: true },
    montant: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const RemboursementSchema = new Schema<IRemboursement>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    clientNom: { type: String },
    numero: { type: String, required: true },
    datePaiement: { type: Date, default: Date.now },
    montantTotal: { type: Number, required: true, min: 1 },
    mode: { type: String, required: true },
    reference: { type: String },
    allocations: { type: [AllocationSchema], required: true },
    recuPar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recuParNom: { type: String },
    idempotencyKey: { type: String },
    statut: { type: String, enum: ["valide", "annule"], default: "valide" },
  },
  { timestamps: true, collection: "remboursements" }
);

RemboursementSchema.index({ entrepriseId: 1, numero: 1 }, { unique: true });
RemboursementSchema.index(
  { entrepriseId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);
RemboursementSchema.index({ entrepriseId: 1, clientId: 1, datePaiement: -1 });
RemboursementSchema.index({ entrepriseId: 1, kiosqueId: 1, datePaiement: -1 });
RemboursementSchema.index({ "allocations.creanceId": 1 });

export const Remboursement: Model<IRemboursement> =
  (mongoose.models.Remboursement as Model<IRemboursement>) ||
  mongoose.model<IRemboursement>("Remboursement", RemboursementSchema);
