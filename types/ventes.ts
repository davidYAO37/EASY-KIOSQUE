/** Types partagés ventes / clients / notifications — échangés entre API et UI. */

export type TypeVente = "comptant" | "credit";
export type StatutVente = "validee" | "annulee";
export type StatutPaiement = "paye" | "partiel" | "non_paye";

export interface ClientDTO {
  _id: string;
  code: string;
  nom: string;
  prenoms?: string;
  telephone?: string;
  adresse?: string;
  plafondCredit?: number | null;
  statut?: string;
  soldeDu?: number;
  createdAt?: string;
}

export interface LigneVenteDTO {
  produitId: string;
  code: string;
  designation: string;
  quantite: number;
  prixUnitaire: number;
  montant: number;
}

export interface PaiementDTO {
  _id?: string;
  mode: string;
  montant: number;
  montantRecu?: number;
  monnaieRendue?: number;
  recuParNom?: string;
  datePaiement?: string;
  statut?: string;
}

export interface AnnulationDTO {
  motif: string;
  annuleeLe: string;
  annuleeParNom?: string;
}

export interface VenteDTO {
  _id: string;
  numeroVente: string;
  dateVente: string;
  kiosqueId: string;
  kiosque?: { _id: string; code: string; designation: string } | null;
  vendeurId: string;
  vendeurNom?: string;
  clientId?: string | null;
  clientNom?: string | null;
  typeVente: TypeVente;
  statutVente: StatutVente;
  montantTotal: number;
  montantPaye: number;
  resteAPayer: number;
  statutPaiement: StatutPaiement;
  monnaieRendue?: number;
  annulation?: AnnulationDTO | null;
  lignes?: LigneVenteDTO[];
  paiements?: PaiementDTO[];
}

export interface ListeVentes {
  ventes: VenteDTO[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  /** Récap des encaissements validés sur le filtre courant, par mode. */
  recapPaiements?: { mode: string; montant: number; nombre: number }[];
}

export type StatutDemandeAnnulation = "en_attente" | "approuvee" | "rejetee";

export interface DemandeAnnulationDTO {
  _id: string;
  venteId: string;
  numeroVente: string;
  montantTotal: number;
  dateVente?: string;
  kiosqueId?: string;
  kiosque?: { _id: string; code: string; designation: string } | null;
  demandeurId: string;
  demandeurNom: string;
  motif: string;
  statut: StatutDemandeAnnulation;
  traiteLe?: string | null;
  traiteParNom?: string | null;
  motifRejet?: string | null;
  createdAt?: string;
}

export interface ListeDemandesAnnulation {
  demandes: DemandeAnnulationDTO[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface NotificationDTO {
  _id: string;
  type: string;
  titre: string;
  message: string;
  venteId?: string | null;
  numeroVente?: string;
  montant?: number;
  vendeurNom?: string;
  kiosqueId?: string | null;
  kiosqueNom?: string;
  lue: boolean;
  createdAt?: string;
}

/** Données du ticket imprimable (en-tête entreprise + contenu vente). */
export interface TicketVente {
  entreprise: {
    nom: string;
    telephone?: string;
    adresse?: string;
    ville?: string;
  };
  kiosque: { code: string; designation: string; adresse?: string };
  vente: VenteDTO;
  /** Préférence d'impression de l'entreprise (imprimante + format + auto). */
  impression?: { imprimanteDefaut?: string; format?: "thermique80" | "a4"; impressionAuto?: boolean };
}
