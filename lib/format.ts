/** Formatage montant FCFA côté client et serveur. */
export function fmtMontant(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));
}

export function fmtDate(d?: string | Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  return isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR");
}

export const STATUTS_VENTE: Record<string, { label: string; color: string }> = {
  validee: { label: "Validée", color: "success" },
  brouillon: { label: "Non validée", color: "secondary" },
  annulee: { label: "Annulée", color: "danger" },
};

export const STATUTS_CREANCE: Record<string, { label: string; color: string }> = {
  non_paye: { label: "Non payé", color: "danger" },
  partielle: { label: "Partiellement payé", color: "warning" },
  soldee: { label: "Soldé", color: "success" },
  annulee: { label: "Annulé", color: "secondary" },
};

export const STATUTS_KIOSQUE: Record<string, { label: string; color: string }> = {
  actif: { label: "Actif", color: "success" },
  inactif: { label: "Inactif", color: "secondary" },
};

/** Moyens de paiement disponibles au point de vente (Côte d'Ivoire). */
export const MODES_PAIEMENT = [
  "Espèces",
  "Orange Money",
  "MTN Money",
  "Wave",
  "Autre",
] as const;

export type ModePaiement = (typeof MODES_PAIEMENT)[number];

export const STATUTS_PAIEMENT: Record<string, { label: string; color: string }> = {
  paye: { label: "Payé", color: "success" },
  partiel: { label: "Partiel", color: "warning" },
  non_paye: { label: "Non payé", color: "danger" },
};
