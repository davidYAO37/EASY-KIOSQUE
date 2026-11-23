/** Types partagés catalogue — échangés entre API et UI. */

export type TypeProduit = "FABRIQUE" | "REVENTE" | "MIXTE";

export interface CategorieDTO {
  _id: string;
  code: string;
  libelle: string;
  description?: string;
  ordre?: number;
  statut?: string;
  nbProduits?: number;
}

export interface PrixKiosqueDTO {
  kiosqueId: string;
  prixVente: number;
}

export interface ProduitDTO {
  _id: string;
  code: string;
  codeBarre?: string | null;
  designation: string;
  categorieId?: string | null;
  categorie?: { _id: string; code: string; libelle: string } | null;
  typeProduit: TypeProduit;
  prixAchat?: number | null;
  prixVente: number;
  seuilAlerte?: number | null;
  description?: string;
  image?: string;
  prixKiosques?: PrixKiosqueDTO[];
  statut?: string;
  createdAt?: string;
}

export interface ListeProduits {
  produits: ProduitDTO[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface ResultatImport {
  crees: number;
  majs: number;
  erreurs: { ligne: number; message: string }[];
}
