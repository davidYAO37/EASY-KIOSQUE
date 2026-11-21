import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Mouvement de caisse — entrées et sorties réelles d'argent.
 * Le solde théorique d'une caisse = somme des mouvements.
 * `sessionCaisseId` sera renseigné par le module Caisses (Phase 5) ;
 * les mouvements enregistrés avant l'ouverture restent rattachables
 * au kiosque et à la date.
 */
export interface IMouvementCaisse extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  sessionCaisseId?: Types.ObjectId | null;
  type: "entree" | "sortie";
  motif:
    | "vente"
    | "remboursement"
    | "annulation_vente"
    | "depense"
    | "annulation_depense"
    | "fond_caisse"
    | "remise"
    | "divers";
  montant: number;
  modePaiement?: string;
  venteId?: Types.ObjectId | null;
  paiementId?: Types.ObjectId | null;
  depenseId?: Types.ObjectId | null;
  userId: Types.ObjectId;
  userNom?: string;
  date: Date;
  createdAt?: Date;
}

const MouvementCaisseSchema = new Schema<IMouvementCaisse>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    sessionCaisseId: { type: Schema.Types.ObjectId, ref: "SessionCaisse", default: null },
    type: { type: String, enum: ["entree", "sortie"], required: true },
    motif: {
      type: String,
      enum: [
        "vente",
        "remboursement",
        "annulation_vente",
        "depense",
        "annulation_depense",
        "fond_caisse",
        "remise",
        "divers",
      ],
      required: true,
    },
    montant: { type: Number, required: true, min: 0 },
    modePaiement: { type: String },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", default: null },
    paiementId: { type: Schema.Types.ObjectId, ref: "Paiement", default: null },
    depenseId: { type: Schema.Types.ObjectId, ref: "Depense", default: null },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userNom: { type: String },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "mouvementscaisses" }
);

MouvementCaisseSchema.index({ entrepriseId: 1, kiosqueId: 1, date: -1 });
MouvementCaisseSchema.index({ entrepriseId: 1, sessionCaisseId: 1 });
MouvementCaisseSchema.index({ venteId: 1 });

export const MouvementCaisse: Model<IMouvementCaisse> =
  (mongoose.models.MouvementCaisse as Model<IMouvementCaisse>) ||
  mongoose.model<IMouvementCaisse>("MouvementCaisse", MouvementCaisseSchema);
