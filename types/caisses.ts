/** Types partagés — Caisses & Remises (Phase 5). */

export type StatutSession = "ouverte" | "en_cloture" | "cloturee";

export interface PointCaisseDTO {
  montantCompte: number;
  soldeTheorique: number;
  ecart: number;
  commentaire?: string;
  declareParNom: string;
  datePoint: string;
  statut: "en_attente" | "rejete" | "valide";
  motifRejet?: string;
  rejetePar?: string;
}

export interface SessionCaisseDTO {
  _id: string;
  numero: string;
  kiosqueId: string;
  kiosqueCode?: string;
  kiosqueNom?: string;
  statut: StatutSession;
  fondDeCaisse: number;
  ouverteParNom: string;
  dateOuverture: string;
  /** Visible uniquement pour les profils de contrôle (pas le vendeur). */
  points?: PointCaisseDTO[];
  nbPoints?: number;
  pointEnAttente?: PointCaisseDTO | null;
  cloture?: {
    clotureeParNom: string;
    dateCloture: string;
    commentaire?: string;
    montantCompte?: number | null;
    soldeTheorique: number;
    ecart?: number | null;
  } | null;
  /** Soldes calculés — masqués au vendeur (il compte sans connaître le théorique). */
  totalEntrees?: number;
  totalSorties?: number;
  soldeTheorique?: number;
  remisesEnAttente?: number;
}

export interface MouvementCaisseDTO {
  _id: string;
  type: "entree" | "sortie";
  motif: string;
  montant: number;
  modePaiement?: string;
  userNom?: string;
  venteId?: string | null;
  date: string;
}

export type StatutRemise = "declaree" | "confirmee" | "annulee";

export interface RemiseDTO {
  _id: string;
  numero: string;
  kiosqueId: string;
  kiosqueNom?: string;
  montant: number;
  note?: string;
  statut: StatutRemise;
  declareeParNom: string;
  dateDeclaration: string;
  confirmeeParNom?: string;
  dateConfirmation?: string;
  annuleeParNom?: string;
  motifAnnulation?: string;
}
