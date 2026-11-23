export interface NiveauStockDTO {
  produitId: string;
  code: string;
  designation: string;
  prixAchat: number | null;
  seuilAlerte: number | null;
  kiosqueId: string;
  kiosqueNom: string;
  quantite: number;
  rupture: boolean;
  sousSeuil: boolean;
  valorisation: number;
}

export interface ListeNiveaux {
  stockActif: boolean;
  venteSansStockAutorisee: boolean;
  niveaux: NiveauStockDTO[];
}

export interface MouvementStockDTO {
  _id: string;
  kiosqueId: string;
  produitId: string;
  produitCode: string;
  produitDesignation: string;
  type: "entree" | "vente" | "annulation_vente" | "ajustement";
  quantite: number;
  avant: number;
  apres: number;
  motif?: string;
  venteNumero?: string;
  userNom: string;
  createdAt: string;
}

export interface ListeMouvements {
  mouvements: MouvementStockDTO[];
  total: number;
  page: number;
  pages: number;
}
