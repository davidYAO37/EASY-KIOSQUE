import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Remise d'argent — déclaration par l'opérateur, confirmation propriétaire.
 *
 * declaree → confirmee (mouvement de sortie de caisse enregistré à la
 *           confirmation : c'est là que l'argent quitte réellement la caisse)
 *         → annulee (par un profil autorisé, motif obligatoire ; la remise
 *           déclarée est conservée — jamais supprimée physiquement)
 *
 * Le vendeur déclare ; il ne peut ni confirmer ni annuler.
 * `idempotencyKey` empêche la double déclaration d'une même remise.
 */

export interface IRemise extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  sessionCaisseId?: Types.ObjectId | null;
  numero: string;
  montant: number;
  note?: string;
  statut: "declaree" | "confirmee" | "annulee";
  declareePar: Types.ObjectId;
  declareeParNom: string;
  dateDeclaration: Date;
  confirmeePar?: Types.ObjectId | null;
  confirmeeParNom?: string;
  dateConfirmation?: Date;
  annuleePar?: Types.ObjectId | null;
  annuleeParNom?: string;
  dateAnnulation?: Date;
  motifAnnulation?: string;
  idempotencyKey?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const RemiseSchema = new Schema<IRemise>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    sessionCaisseId: { type: Schema.Types.ObjectId, ref: "SessionCaisse", default: null },
    numero: { type: String, required: true },
    montant: { type: Number, required: true, min: 1 },
    note: { type: String },
    statut: {
      type: String,
      enum: ["declaree", "confirmee", "annulee"],
      default: "declaree",
      required: true,
    },
    declareePar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    declareeParNom: { type: String, required: true },
    dateDeclaration: { type: Date, required: true },
    confirmeePar: { type: Schema.Types.ObjectId, ref: "User", default: null },
    confirmeeParNom: { type: String },
    dateConfirmation: { type: Date },
    annuleePar: { type: Schema.Types.ObjectId, ref: "User", default: null },
    annuleeParNom: { type: String },
    dateAnnulation: { type: Date },
    motifAnnulation: { type: String },
    idempotencyKey: { type: String },
  },
  { timestamps: true, collection: "remises" }
);

RemiseSchema.index({ entrepriseId: 1, numero: 1 }, { unique: true });
RemiseSchema.index(
  { entrepriseId: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);
RemiseSchema.index({ entrepriseId: 1, kiosqueId: 1, dateDeclaration: -1 });
RemiseSchema.index({ entrepriseId: 1, statut: 1 });
RemiseSchema.index({ entrepriseId: 1, declareePar: 1, dateDeclaration: -1 });

export const Remise: Model<IRemise> =
  (mongoose.models.Remise as Model<IRemise>) ||
  mongoose.model<IRemise>("Remise", RemiseSchema);
