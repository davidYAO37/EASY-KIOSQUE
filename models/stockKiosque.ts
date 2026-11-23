import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Niveau de stock d'un produit dans UN kiosque.
 * Une ligne par (entreprise, kiosque, produit) — créée à la première
 * entrée de stock, incrémentée/décrémentée ensuite. Les quantités
 * peuvent devenir négatives si l'entreprise autorise la vente sans
 * stock (réglage `Entreprise.stock.venteSansStockAutorisee`).
 *
 * Seuls les produits `typeProduit === "REVENTE"` sont suivis.
 */
export interface IStockKiosque extends Document {
  entrepriseId: Types.ObjectId;
  kiosqueId: Types.ObjectId;
  produitId: Types.ObjectId;
  quantite: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const StockKiosqueSchema = new Schema<IStockKiosque>(
  {
    entrepriseId: { type: Schema.Types.ObjectId, ref: "Entreprise", required: true },
    kiosqueId: { type: Schema.Types.ObjectId, ref: "Kiosque", required: true },
    produitId: { type: Schema.Types.ObjectId, ref: "Produit", required: true },
    quantite: { type: Number, required: true, default: 0 },
  },
  { timestamps: true, collection: "stockskiosques" }
);

StockKiosqueSchema.index({ entrepriseId: 1, kiosqueId: 1, produitId: 1 }, { unique: true });
StockKiosqueSchema.index({ entrepriseId: 1, produitId: 1 });

export const StockKiosque: Model<IStockKiosque> =
  (mongoose.models.StockKiosque as Model<IStockKiosque>) ||
  mongoose.model<IStockKiosque>("StockKiosque", StockKiosqueSchema);
