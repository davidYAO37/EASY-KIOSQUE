import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Profil = modèle de droits réutilisable, propre à chaque entreprise.
 * Un profil porte un rôle de base (`type`) et, en option, un jeu de
 * permissions personnalisées appliquées aux utilisateurs qui le reçoivent.
 */
export interface IProfil extends Document {
  entrepriseId: Types.ObjectId;
  profil: string;
  type?: string;
  services?: string[];
  actions?: string[];
  customized?: boolean;
}

const ProfilSchema = new Schema<IProfil>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    profil: { type: String, required: true },
    type: { type: String, default: "caissier" },
    services: [String],
    actions: [String],
    customized: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "profils" }
);

// Nom de profil unique dans le périmètre de l'entreprise
ProfilSchema.index({ entrepriseId: 1, profil: 1 }, { unique: true });

export const Profil: Model<IProfil> =
  (mongoose.models.Profil as Model<IProfil>) ||
  mongoose.model<IProfil>("Profil", ProfilSchema);
