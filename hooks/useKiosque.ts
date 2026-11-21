"use client";

import { useCallback, useEffect, useState } from "react";

export interface KiosqueItem {
  _id: string;
  code: string;
  designation: string;
  statut?: string;
}

const CLE_STORAGE = "ek_kiosque_id";
const CLE_COOKIE = "ek_kiosque";

function poserCookieKiosque(id: string) {
  // Cookie lisible côté serveur — la route vérifie TOUJOURS l'appartenance
  // du kiosque à l'entreprise avant de l'utiliser (jamais de confiance).
  document.cookie = `${CLE_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=strict`;
}

/**
 * Kiosque courant sélectionné dans le header.
 * Persisté en localStorage + cookie ; la vérification d'appartenance
 * reste faite côté serveur à chaque requête métier.
 */
export function useKiosque() {
  const [kiosques, setKiosques] = useState<KiosqueItem[]>([]);
  const [kiosqueId, setKiosqueId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Le super-admin plateforme n'a pas d'entreprise → pas d'appel métier
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => {
        if (cancelled) return null;
        if (!me?.entreprise) {
          setKiosques([]);
          setKiosqueId("");
          return null;
        }
        return fetch("/api/kiosques", { credentials: "include" });
      })
      .then((res) => (res && res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const liste: KiosqueItem[] = (data?.kiosques || []).filter(
          (k: KiosqueItem) => k.statut !== "inactif"
        );
        setKiosques(liste);

        const stocke = localStorage.getItem(CLE_STORAGE) || "";
        const valide = liste.find((k) => k._id === stocke);
        const choisi = valide ? stocke : liste[0]?._id || "";
        setKiosqueId(choisi);
        if (choisi) {
          localStorage.setItem(CLE_STORAGE, choisi);
          poserCookieKiosque(choisi);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changerKiosque = useCallback((id: string) => {
    setKiosqueId(id);
    localStorage.setItem(CLE_STORAGE, id);
    poserCookieKiosque(id);
  }, []);

  const kiosque = kiosques.find((k) => k._id === kiosqueId) || null;

  return { kiosque, kiosqueId, kiosques, loading, changerKiosque };
}
