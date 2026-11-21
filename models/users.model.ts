import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Utilisateur EASY-KIOSQUE.
 *
 * - `entrepriseId` rattache le compte à un tenant (null = super-admin
 *   plateforme) : c'est la clé de l'isolation multi-tenant.
 * - `kiosqueIds` limite l'accès aux kiosques affectés (vide = tous).
 * - `type` = rôle : adminsuper, admin, gestionnaire, responsable,
 *   caissier, comptable.
 */
export interface IUser extends Document {
  nom?: string;
  prenom?: string;
  name?: string;
  email: string;
  telephone?: string | null;
  password?: string;
  type?: string;
  entrepriseId?: Types.ObjectId | null;
  kiosqueIds?: Types.ObjectId[];
  uid?: string;
  profilId?: Types.ObjectId;
  comptebloque?: boolean;
  permissions?: {
    services?: string[];
    actions?: string[];
    customized?: boolean;
  };
  tokenVersion?: number;
  failedAttempts?: number;
  remainingAttempts?: number;
  isLocked?: boolean;
  lockedUntil?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    nom: { type: String },
    prenom: { type: String },
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true },
    telephone: { type: String, default: null },
    password: { type: String },
    type: { type: String, default: "caissier" },
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", default: null },
    kiosqueIds: [{ type: Schema.Types.ObjectId, ref: "Kiosque" }],
    uid: { type: String, unique: true, sparse: true },
    profilId: { type: Schema.Types.ObjectId, ref: "Profil" },
    comptebloque: { type: Boolean, default: false },
    permissions: {
      services: { type: [String], default: undefined },
      actions: { type: [String], default: undefined },
      customized: { type: Boolean, default: false },
    },
    tokenVersion: { type: Number, default: 0 },
    failedAttempts: { type: Number, default: 0 },
    remainingAttempts: { type: Number, default: 4 },
    isLocked: { type: Boolean, default: false },
    lockedUntil: { type: Date },
  },
  { timestamps: true, collection: "users" }
);

UserSchema.index({ entrepriseId: 1, email: 1 });
UserSchema.index({ entrepriseId: 1, type: 1 });

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) ||
  mongoose.model<IUser>("User", UserSchema);

export const UserCollection = User;
