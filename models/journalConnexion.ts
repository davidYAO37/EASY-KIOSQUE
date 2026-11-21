import mongoose, { Schema, Document, Model, Types } from "mongoose";

/** Journal des connexions (traçabilité des accès par tenant). */
export interface IJournalConnexion extends Document {
  entrepriseId?: Types.ObjectId | null;
  userId?: Types.ObjectId;
  email?: string;
  ip?: string;
  userAgent?: string;
  statut: "success" | "failure" | "locked";
  message?: string;
  createdAt?: Date;
}

const JournalConnexionSchema = new Schema<IJournalConnexion>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    email: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    statut: { type: String, required: true },
    message: { type: String },
  },
  { timestamps: true, collection: "journalconnexions" }
);

JournalConnexionSchema.index({ entrepriseId: 1, createdAt: -1 });

export const JournalConnexion: Model<IJournalConnexion> =
  (mongoose.models.JournalConnexion as Model<IJournalConnexion>) ||
  mongoose.model<IJournalConnexion>("JournalConnexion", JournalConnexionSchema);
