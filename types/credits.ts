/** Types partagés crédits / remboursements — Phase 4. */

export type StatutCreance = "non_paye" | "partielle" | "soldee" | "annulee";

export interface CreanceDTO {
  _id: string;
  clientId: string;
  client?: { _id: string; code: string; nom: string; prenoms?: string } | null;
  venteId: string;
  numeroVente: string;
  kiosqueId: string;
  kiosque?: { _id: string; code: string; designation: string } | null;
  dateVente: string;
  montantInitial: number;
  montantPaye: number;
  solde: number;
  statut: StatutCreance;
}

export interface ListeCreances {
  creances: CreanceDTO[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  /** Somme des soldes encore dus (tous filtres confondus sur la page courante + global). */
  totalDu: number;
}

export interface AllocationDTO {
  creanceId: string;
  venteId: string;
  numeroVente: string;
  montant: number;
}

export interface RemboursementDTO {
  _id: string;
  numero: string;
  datePaiement: string;
  kiosqueId: string;
  kiosque?: { _id: string; code: string; designation: string } | null;
  clientId: string;
  clientNom?: string;
  montantTotal: number;
  mode: string;
  reference?: string;
  recuParNom?: string;
  allocations: AllocationDTO[];
  statut: string;
}

export interface ListeRemboursements {
  remboursements: RemboursementDTO[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

/** Reçu imprimable d'un remboursement (format selon entreprise.impression). */
export interface RecuRemboursement {
  entreprise: {
    nom: string;
    telephone?: string;
    adresse?: string;
    ville?: string;
  };
  kiosque: { code: string; designation: string; adresse?: string };
  remboursement: RemboursementDTO;
  /** Solde restant du client après ce règlement. */
  soldeRestantClient: number;
  impression?: { imprimanteDefaut?: string; format?: "thermique80" | "a4" };
}
