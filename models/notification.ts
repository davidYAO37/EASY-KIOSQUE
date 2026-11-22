import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Notification propriétaire — créée APRÈS enregistrement effectif en base
 * (vente validée, annulation...). `lusPar` trace les utilisateurs ayant lu.
 */
export interface INotification extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId?: Types.ObjectId | null;
  type: "vente" | "annulation_vente" | "demande_annulation" | "remboursement" | "caisse" | "depense" | "info";
  titre: string;
  message: string;
  venteId?: Types.ObjectId | null;
  numeroVente?: string;
  montant?: number;
  vendeurId?: Types.ObjectId | null;
  vendeurNom?: string;
  lusPar: Types.ObjectId[];
  createdAt?: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", default: null },
    type: {
      type: String,
      enum: ["vente", "annulation_vente", "demande_annulation", "remboursement", "caisse", "depense", "info"],
      required: true,
    },
    titre: { type: String, required: true },
    message: { type: String, required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", default: null },
    numeroVente: { type: String },
    montant: { type: Number },
    vendeurId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    vendeurNom: { type: String },
    lusPar: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true, collection: "notifications" }
);

NotificationSchema.index({ entrepriseId: 1, createdAt: -1 });
NotificationSchema.index({ entrepriseId: 1, kiosqueId: 1, createdAt: -1 });

export const Notification: Model<INotification> =
  (mongoose.models.Notification as Model<INotification>) ||
  mongoose.model<INotification>("Notification", NotificationSchema);
