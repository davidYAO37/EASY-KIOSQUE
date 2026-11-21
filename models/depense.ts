import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Dépense — sortie d'argent enregistrée sur un kiosque.
 *
 * - Une dépense validée n'est jamais supprimée ni modifiée physiquement :
 *   l'annulation est une opération tracée (`annulation`), conservée.
 * - L'enregistrement exige une session de caisse ouverte sur le kiosque :
 *   la dépense matérialise une sortie réelle d'espèces du tiroir-caisse
 *   (mouvement `depense`). L'annulation produit un mouvement
 *   compensateur d'entrée (`annulation_depense`).
 * - Idempotence : `idempotencyKey` unique par entreprise (double soumission
 *   réseau/UI → même dépense renvoyée, pas de doublon).
 */
export interface IDepense extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  categorieDepenseId?: Types.ObjectId | null;
  sessionCaisseId?: Types.ObjectId | null;
  numero: string; // DEP-{codeKiosque}-{année}-####
  montant: number;
  motif?: string;
  dateDepense: Date;
  statut: "validee" | "annulee";
  creeParId: Types.ObjectId;
  creeParNom?: string;
  annulation?: {
    motif: string;
    annuleeLe: Date;
    annuleeParId: Types.ObjectId;
    annuleeParNom?: string;
  };
  idempotencyKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const DepenseSchema = new Schema<IDepense>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    categorieDepenseId: {
      type: Schema.Types.ObjectId,
      ref: "CategorieDepense",
      default: null,
    },
    sessionCaisseId: { type: Schema.Types.ObjectId, ref: "SessionCaisse", default: null },
    numero: { type: String, required: true },
    montant: { type: Number, required: true, min: 1 },
    motif: { type: String, trim: true },
    dateDepense: { type: Date, default: Date.now },
    statut: { type: String, enum: ["validee", "annulee"], default: "validee" },
    creeParId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creeParNom: { type: String },
    annulation: {
      motif: { type: String },
      annuleeLe: { type: Date },
      annuleeParId: { type: Schema.Types.ObjectId, ref: "User" },
      annuleeParNom: { type: String },
    },
    idempotencyKey: { type: String },
  },
  { timestamps: true, collection: "depenses" }
);

DepenseSchema.index({ entrepriseId: 1, numero: 1 }, { unique: true });
DepenseSchema.index(
  { entrepriseId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true } } }
);
DepenseSchema.index({ entrepriseId: 1, kiosqueId: 1, dateDepense: -1 });
DepenseSchema.index({ entrepriseId: 1, statut: 1 });
DepenseSchema.index({ entrepriseId: 1, creeParId: 1 });
DepenseSchema.index({ sessionCaisseId: 1 });

export const Depense: Model<IDepense> =
  (mongoose.models.Depense as Model<IDepense>) ||
  mongoose.model<IDepense>("Depense", DepenseSchema);
