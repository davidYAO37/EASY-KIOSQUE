import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Jeton de réinitialisation de mot de passe (« mot de passe oublié »).
 * Seul le HASH SHA-256 du jeton est stocké — le jeton en clair n'est
 * connu que du destinataire de l'email. Expiration 1 h, usage unique.
 */
export interface ITokenReset extends Document {
  userId: Types.ObjectId;
  email: string;
  tokenHash: string;
  expireLe: Date;
  utiliseLe?: Date | null;
  createdAt?: Date;
}

const TokenResetSchema = new Schema<ITokenReset>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true },
    tokenHash: { type: String, required: true, unique: true },
    expireLe: { type: Date, required: true },
    utiliseLe: { type: Date, default: null },
  },
  { timestamps: true, collection: "tokensreset" }
);

TokenResetSchema.index({ expireLe: 1 }, { expireAfterSeconds: 0 });
TokenResetSchema.index({ userId: 1, utiliseLe: 1 });

export const TokenReset: Model<ITokenReset> =
  (mongoose.models.TokenReset as Model<ITokenReset>) ||
  mongoose.model<ITokenReset>("TokenReset", TokenResetSchema);
