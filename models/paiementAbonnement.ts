import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Paiement d'abonnement enregistré par le super-admin (encaissement
 * Wave / Orange Money / MTN MoMo / virement — saisi manuellement tant
 * qu'aucune passerelle automatique n'est connectée). Jamais supprimé :
 * historique de facturation de la plateforme.
 */
export interface IPaiementAbonnement extends Document {
  entrepriseId: Types.ObjectId;
  planCode: string;
  montant: number;
  periodeDebut: Date;
  periodeFin: Date;
  modePaiement: string;
  reference?: string;
  note?: string;
  enregistrePar?: Types.ObjectId;
  createdAt?: Date;
}

const PaiementAbonnementSchema = new Schema<IPaiementAbonnement>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    planCode: { type: String, required: true, uppercase: true },
    montant: { type: Number, required: true, min: 0 },
    periodeDebut: { type: Date, required: true },
    periodeFin: { type: Date, required: true },
    modePaiement: { type: String, required: true },
    reference: { type: String },
    note: { type: String },
    enregistrePar: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true, collection: "paiementsabonnement" }
);

PaiementAbonnementSchema.index({ entrepriseId: 1, createdAt: -1 });

export const PaiementAbonnement: Model<IPaiementAbonnement> =
  (mongoose.models.PaiementAbonnement as Model<IPaiementAbonnement>) ||
  mongoose.model<IPaiementAbonnement>("PaiementAbonnement", PaiementAbonnementSchema);
