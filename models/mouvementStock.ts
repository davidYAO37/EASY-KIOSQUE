import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Mouvement de stock — journal immuable de tout ce qui fait varier
 * la quantité d'un produit dans un kiosque :
 *
 * - `entree`            : approvisionnement saisi manuellement ;
 * - `vente`             : sortie automatique à la validation d'une vente ;
 * - `annulation_vente`  : restitution automatique à l'annulation ;
 * - `ajustement`        : correction motivée (casse, erreur de comptage) ;
 * - `inventaire`        : mise au stock réel compté (delta tracé).
 *
 * `quantite` est le delta signé ; `avant`/`apres` figent le niveau.
 * Jamais de suppression — l'historique reste auditable.
 */
export type TypeMouvementStock =
  | "entree"
  | "vente"
  | "annulation_vente"
  | "ajustement"
  | "inventaire";

export interface IMouvementStock extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  produitId: Types.ObjectId;
  produitCode: string;
  produitDesignation: string;
  type: TypeMouvementStock;
  quantite: number;
  avant: number;
  apres: number;
  motif?: string;
  venteId?: Types.ObjectId | null;
  venteNumero?: string;
  userId: Types.ObjectId;
  userNom: string;
  createdAt?: Date;
}

const MouvementStockSchema = new Schema<IMouvementStock>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    produitId: { type: Schema.Types.ObjectId, ref: "Produit", required: true },
    produitCode: { type: String, required: true },
    produitDesignation: { type: String, required: true },
    type: {
      type: String,
      enum: ["entree", "vente", "annulation_vente", "ajustement", "inventaire"],
      required: true,
    },
    quantite: { type: Number, required: true },
    avant: { type: Number, required: true },
    apres: { type: Number, required: true },
    motif: { type: String },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", default: null },
    venteNumero: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userNom: { type: String, required: true },
  },
  { timestamps: true, collection: "mouvementsstock" }
);

MouvementStockSchema.index({ entrepriseId: 1, kiosqueId: 1, createdAt: -1 });
MouvementStockSchema.index({ entrepriseId: 1, produitId: 1, createdAt: -1 });
MouvementStockSchema.index({ venteId: 1 });

export const MouvementStock: Model<IMouvementStock> =
  (mongoose.models.MouvementStock as Model<IMouvementStock>) ||
  mongoose.model<IMouvementStock>("MouvementStock", MouvementStockSchema);
