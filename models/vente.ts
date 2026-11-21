import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Vente validée au point de vente.
 *
 * RÈGLES INALTÉRABLES :
 * - Jamais de suppression physique — l'annulation est une opération
 *   tracée (`annulation` + journal d'activité), la vente est conservée.
 * - `montantTotal` est recalculé côté serveur à partir des prix officiels
 *   (jamais depuis le navigateur).
 * - `idempotencyKey` empêche la double validation d'une même vente.
 */
export interface IVente extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  numeroVente: string;
  dateVente: Date;
  vendeurId: Types.ObjectId;
  vendeurNom?: string;
  clientId?: Types.ObjectId | null;
  clientNom?: string;
  typeVente: "comptant" | "credit";
  statutVente: "validee" | "annulee";
  montantTotal: number;
  montantPaye: number;
  resteAPayer: number;
  statutPaiement: "paye" | "partiel" | "non_paye";
  monnaieRendue?: number;
  idempotencyKey?: string;
  annulation?: {
    motif: string;
    annuleeLe: Date;
    annuleePar: Types.ObjectId;
    annuleeParNom?: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const VenteSchema = new Schema<IVente>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    numeroVente: { type: String, required: true },
    dateVente: { type: Date, default: Date.now },
    vendeurId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    vendeurNom: { type: String },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", default: null },
    clientNom: { type: String },
    typeVente: { type: String, enum: ["comptant", "credit"], required: true },
    statutVente: { type: String, enum: ["validee", "annulee"], default: "validee" },
    montantTotal: { type: Number, required: true, min: 0 },
    montantPaye: { type: Number, required: true, min: 0 },
    resteAPayer: { type: Number, required: true, min: 0 },
    statutPaiement: {
      type: String,
      enum: ["paye", "partiel", "non_paye"],
      required: true,
    },
    monnaieRendue: { type: Number, default: 0 },
    idempotencyKey: { type: String },
    annulation: {
      motif: { type: String },
      annuleeLe: { type: Date },
      annuleePar: { type: Schema.Types.ObjectId, ref: "User" },
      annuleeParNom: { type: String },
    },
  },
  { timestamps: true, collection: "ventes" }
);

VenteSchema.index({ entrepriseId: 1, numeroVente: 1 }, { unique: true });
// Idempotence : une clé par entreprise — rejette les doubles validations
VenteSchema.index(
  { entrepriseId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);
VenteSchema.index({ entrepriseId: 1, kiosqueId: 1, dateVente: -1 });
VenteSchema.index({ entrepriseId: 1, vendeurId: 1, dateVente: -1 });
VenteSchema.index({ entrepriseId: 1, clientId: 1 });
VenteSchema.index({ entrepriseId: 1, statutVente: 1, dateVente: -1 });

export const Vente: Model<IVente> =
  (mongoose.models.Vente as Model<IVente>) ||
  mongoose.model<IVente>("Vente", VenteSchema);
