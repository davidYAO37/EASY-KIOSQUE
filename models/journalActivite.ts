import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Journal d'activité : traçabilité des opérations sensibles
 * (annulations, modifications financières, clôtures de caisse...).
 */
export interface IJournalActivite extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId?: Types.ObjectId | null;
  userId?: Types.ObjectId;
  action: string;
  module?: string;
  details?: Record<string, any>;
  ip?: string;
  createdAt?: Date;
}

const JournalActiviteSchema = new Schema<IJournalActivite>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    action: { type: String, required: true },
    module: { type: String },
    details: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true, collection: "journauxactivite" }
);

JournalActiviteSchema.index({ entrepriseId: 1, createdAt: -1 });
JournalActiviteSchema.index({ entrepriseId: 1, kiosqueId: 1, createdAt: -1 });

export const JournalActivite: Model<IJournalActivite> =
  (mongoose.models.JournalActivite as Model<IJournalActivite>) ||
  mongoose.model<IJournalActivite>("JournalActivite", JournalActiviteSchema);
