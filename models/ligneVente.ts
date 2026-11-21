import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Ligne de vente — instantané historique du produit au moment de la vente :
 * `code`, `designation` et surtout `prixUnitaire` (prix officiel serveur,
 * surcharge kiosque incluse) sont figés ici. Toute modification tarifaire
 * ultérieure n'affecte pas les ventes passées.
 */
export interface ILigneVente extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  venteId: Types.ObjectId;
  produitId: Types.ObjectId;
  code: string;
  designation: string;
  typeProduit?: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

const LigneVenteSchema = new Schema<ILigneVente>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    venteId: { type: Schema.Types.ObjectId, ref: "Vente", required: true },
    produitId: { type: Schema.Types.ObjectId, ref: "Produit", required: true },
    code: { type: String, required: true },
    designation: { type: String, required: true },
    typeProduit: { type: String },
    quantite: { type: Number, required: true, min: 1 },
    prixUnitaire: { type: Number, required: true, min: 0 },
    montant: { type: Number, required: true, min: 0 },
  },
  { timestamps: true, collection: "lignesventes" }
);

LigneVenteSchema.index({ venteId: 1 });
LigneVenteSchema.index({ entrepriseId: 1, produitId: 1 });
LigneVenteSchema.index({ entrepriseId: 1, kiosqueId: 1 });

export const LigneVente: Model<ILigneVente> =
  (mongoose.models.LigneVente as Model<ILigneVente>) ||
  mongoose.model<ILigneVente>("LigneVente", LigneVenteSchema);
