"use client";

import { useEffect, useState } from "react";

export interface AuthUser {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  type: string;
  entrepriseId?: string | null;
  kiosqueIds?: string[];
  permissions?: {
    services?: string[];
    actions?: string[];
    customized?: boolean;
  };
}

export interface AuthEntreprise {
  _id: string;
  nomSociete: string;
  nomCommercial?: string;
  devise: string;
  logo?: string;
  statut?: string;
}

/** Récupère l'utilisateur connecté via /api/me (cookie JWT). */
export function useAuthUser() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [entreprise, setEntreprise] = useState<AuthEntreprise | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setUser(data?.user || null);
        setEntreprise(data?.entreprise || null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const aAction = (code: string) =>
    !!user?.permissions?.actions?.includes("*") ||
    !!user?.permissions?.actions?.includes(code);

  return { user, entreprise, loading, aAction };
}
