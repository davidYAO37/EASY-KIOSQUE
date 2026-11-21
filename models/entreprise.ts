import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Entreprise cliente de la plateforme (tenant).
 * Chaque entreprise possède ses propres kiosques, utilisateurs, produits,
 * ventes, caisses... — isolation stricte par `entrepriseId`.
 *
 * Les champs `abonnement*` préparent la facturation SaaS future (V2) ;
 * ils n'ont aucun effet en V1.
 */
export interface IEntreprise extends Document {
  nomSociete: string; // raison sociale ou nom du propriétaire
  nomCommercial?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  logo?: string;
  devise?: string;
  statut?: "actif" | "suspendu";

  // Abonnement (réservé V2)
  abonnementPlan?: string;
  abonnementExpireLe?: Date;

  // Impression : imprimante par défaut + format des tickets/reçus
  impression?: {
    imprimanteDefaut?: string;
    format?: "thermique80" | "a4";
  };

  createdAt?: Date;
  updatedAt?: Date;
}

const EntrepriseSchema = new Schema<IEntreprise>(
  {
    nomSociete: { type: String, required: true },
    nomCommercial: { type: String },
    telephone: { type: String },
    email: { type: String },
    adresse: { type: String },
    ville: { type: String },
    pays: { type: String, default: "Côte d'Ivoire" },
    logo: { type: String },
    devise: { type: String, default: "FCFA" },
    statut: { type: String, enum: ["actif", "suspendu"], default: "actif" },

    abonnementPlan: { type: String },
    abonnementExpireLe: { type: Date },

    impression: {
      imprimanteDefaut: { type: String },
      format: { type: String, enum: ["thermique80", "a4"], default: "thermique80" },
    },
  },
  { timestamps: true, collection: "entreprises" }
);

EntrepriseSchema.index({ statut: 1 });
EntrepriseSchema.index({ email: 1 });

export const Entreprise: Model<IEntreprise> =
  (mongoose.models.Entreprise as Model<IEntreprise>) ||
  mongoose.model<IEntreprise>("Entreprise", EntrepriseSchema);
