/** Types partagés — Dépenses (Phase 6). */

export interface CategorieDepenseDTO {
  _id: string;
  code: string;
  designation: string;
  statut: "actif" | "inactif";
}

export interface DepenseDTO {
  _id: string;
  numero: string;
  kiosqueId: string;
  kiosqueNom?: string;
  categorieDepenseId?: string | null;
  categorieNom?: string | null;
  montant: number;
  motif?: string;
  dateDepense: string;
  statut: "validee" | "annulee";
  creeParNom?: string;
  annulation?: {
    motif: string;
    annuleeLe: string;
    annuleeParNom?: string;
  };
  createdAt?: string;
}
