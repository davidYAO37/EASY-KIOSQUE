import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Session de caisse — cycle de vie d'une caisse de kiosque.
 *
 * ouverte → en_cloture (point journalier déclaré par l'opérateur)
 *         → cloturee (validation propriétaire/gestionnaire)
 * Le propriétaire peut aussi clôturer directement depuis `ouverte`,
 * ou rejeter le point déclaré (`en_cloture` → `ouverte`) : la déclaration
 * rejetée est conservée dans `points` avec statut `rejete` — audit complet.
 *
 * Une seule session non clôturée par kiosque (index partiel unique).
 * Le solde théorique = somme des MouvementCaisse rattachés à la session.
 */

export interface IPointCaisse {
  montantCompte: number;
  soldeTheorique: number;
  ecart: number;
  commentaire?: string;
  declarePar: Types.ObjectId;
  declareParNom: string;
  datePoint: Date;
  statut: "en_attente" | "rejete" | "valide";
  motifRejet?: string;
  rejetePar?: string;
}

export interface ISessionCaisse extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  numero: string;
  statut: "ouverte" | "en_cloture" | "cloturee";
  fondDeCaisse: number;
  ouvertePar: Types.ObjectId;
  ouverteParNom: string;
  dateOuverture: Date;
  points: IPointCaisse[];
  cloture?: {
    clotureePar: Types.ObjectId;
    clotureeParNom: string;
    dateCloture: Date;
    commentaire?: string;
    montantCompte?: number | null;
    soldeTheorique: number;
    ecart?: number | null;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const PointCaisseSchema = new Schema<IPointCaisse>(
  {
    montantCompte: { type: Number, required: true, min: 0 },
    soldeTheorique: { type: Number, required: true },
    ecart: { type: Number, required: true },
    commentaire: { type: String },
    declarePar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    declareParNom: { type: String, required: true },
    datePoint: { type: Date, required: true },
    statut: {
      type: String,
      enum: ["en_attente", "rejete", "valide"],
      required: true,
    },
    motifRejet: { type: String },
    rejetePar: { type: String },
  },
  { _id: false }
);

const SessionCaisseSchema = new Schema<ISessionCaisse>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    numero: { type: String, required: true },
    statut: {
      type: String,
      enum: ["ouverte", "en_cloture", "cloturee"],
      default: "ouverte",
      required: true,
    },
    fondDeCaisse: { type: Number, required: true, min: 0, default: 0 },
    ouvertePar: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ouverteParNom: { type: String, required: true },
    dateOuverture: { type: Date, required: true },
    points: { type: [PointCaisseSchema], default: [] },
    cloture: {
      clotureePar: { type: Schema.Types.ObjectId, ref: "User" },
      clotureeParNom: { type: String },
      dateCloture: { type: Date },
      commentaire: { type: String },
      montantCompte: { type: Number, default: null },
      soldeTheorique: { type: Number },
      ecart: { type: Number, default: null },
    },
  },
  { timestamps: true, collection: "sessionscaisses" }
);

SessionCaisseSchema.index({ entrepriseId: 1, numero: 1 }, { unique: true });
SessionCaisseSchema.index({ entrepriseId: 1, kiosqueId: 1, dateOuverture: -1 });
SessionCaisseSchema.index({ entrepriseId: 1, kiosqueId: 1, statut: 1 });
// Une seule session non clôturée par kiosque
SessionCaisseSchema.index(
  { kiosqueId: 1 },
  {
    unique: true,
    partialFilterExpression: { statut: { $in: ["ouverte", "en_cloture"] } },
    name: "une_session_active_par_kiosque",
  }
);

export const SessionCaisse: Model<ISessionCaisse> =
  (mongoose.models.SessionCaisse as Model<ISessionCaisse>) ||
  mongoose.model<ISessionCaisse>("SessionCaisse", SessionCaisseSchema);
