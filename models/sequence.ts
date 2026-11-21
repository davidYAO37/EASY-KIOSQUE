import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Compteurs de numérotation des documents (ventes, dépenses, clients...).
 * Un compteur par (entrepriseId, kiosqueId, clé) : la numérotation peut
 * être globale à l'entreprise (kiosqueId = null) ou distincte par kiosque.
 * Incrément atomique via findOneAndUpdate + $inc (idempotent, sûr en
 * concurrence, utilisable dans une transaction).
 */
export interface ISequence extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId?: Types.ObjectId | null;
  cle: string;
  valeur: number;
}

const SequenceSchema = new Schema<ISequence>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", default: null },
    cle: { type: String, required: true },
    valeur: { type: Number, default: 0 },
  },
  { timestamps: true, collection: "sequences" }
);

SequenceSchema.index({ entrepriseId: 1, kiosqueId: 1, cle: 1 }, { unique: true });

export const Sequence: Model<ISequence> =
  (mongoose.models.Sequence as Model<ISequence>) ||
  mongoose.model<ISequence>("Sequence", SequenceSchema);
