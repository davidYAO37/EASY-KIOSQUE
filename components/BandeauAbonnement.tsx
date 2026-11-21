"use client";

import { useEffect, useState } from "react";

interface Abo {
  planNom: string;
  statut: "essai" | "actif" | "grace" | "expire";
  joursRestants: number;
  expireLe: string;
}

/**
 * Bandeau d'état d'abonnement affiché en haut du tableau de bord :
 * essai qui se termine (≤ 7 j), période de grâce, abonnement expiré.
 * Masqué pour le super-admin et les abonnements actifs loin de
 * l'échéance.
 */
export default function BandeauAbonnement() {
  const [abo, setAbo] = useState<Abo | null>(null);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const a = data?.entreprise?.abonnement;
        if (a) setAbo(a);
      })
      .catch(() => {});
  }, []);

  if (!abo) return null;

  let variante: string | null = null;
  let texte = "";
  if (abo.statut === "expire") {
    variante = "danger";
    texte = "Votre abonnement a expiré et la période de grâce est dépassée — l'accès aux fonctionnalités est suspendu. Contactez la plateforme EASY-KIOSQUE pour renouveler.";
  } else if (abo.statut === "grace") {
    variante = "danger";
    const restants = Math.max(0, abo.joursRestants + 5);
    texte = `Abonnement ${abo.planNom} expiré — période de grâce : encore ${restants} jour(s) avant suspension de l'accès. Pensez à renouveler.`;
  } else if (abo.statut === "essai" && abo.joursRestants <= 7) {
    variante = "warning";
    texte = `Essai gratuit : ${abo.joursRestants} jour(s) restant(s). Passez à un plan payant pour conserver votre accès sans interruption.`;
  } else if (abo.statut === "essai") {
    variante = "info";
    texte = `Période d'essai — ${abo.joursRestants} jour(s) restant(s) sur votre plan ${abo.planNom}.`;
  } else if (abo.statut === "actif" && abo.joursRestants <= 7) {
    variante = "warning";
    texte = `Votre abonnement ${abo.planNom} expire dans ${abo.joursRestants} jour(s) — pensez au renouvellement.`;
  }

  if (!variante) return null;
  return (
    <div className={`alert alert-${variante} py-2 px-3 mb-3 small d-flex align-items-center`} role="alert">
      <i className="bi bi-clock-history me-2"></i>
      <div>{texte}</div>
    </div>
  );
}
