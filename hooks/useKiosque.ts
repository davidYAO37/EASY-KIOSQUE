"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";

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
const KiosqueContext = createContext<{
  kiosques: KiosqueItem[]; kiosqueId: string; loading: boolean;
  changerKiosque: (id: string) => void; actualiserKiosques: () => void;
} | null>(null);

export function KiosqueProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useAuthUser();
  const scope = user?.entrepriseId ? `${user.entrepriseId}:${user._id}` : '';
  const [version, setVersion] = useState(0);
  const [scopeCharge, setScopeCharge] = useState('');
  const actualiserKiosques = useCallback(() => setVersion((v) => v + 1), []);
  const [kiosques, setKiosques] = useState<KiosqueItem[]>([]);
  const [kiosqueId, setKiosqueId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Le super-admin plateforme n'a pas d'entreprise → pas d'appel métier
    if (sessionLoading) return;
    if (!scope) {
      setKiosques([]); setKiosqueId(''); setScopeCharge(''); setLoading(false);
      poserCookieKiosque('');
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    fetch("/api/kiosques", { credentials: "include", cache: "no-store", signal: controller.signal })
      .then((res) => { if (!res.ok) throw new Error('Kiosques indisponibles'); return res.json(); })
      .then((data) => {
        if (cancelled) return;
        const liste: KiosqueItem[] = (data?.kiosques || []).filter(
          (k: KiosqueItem) => k.statut !== "inactif"
        );
        setKiosques(liste);

        const stocke = localStorage.getItem(`${CLE_STORAGE}:${scope}`);
        const valide = liste.some((k) => k._id === stocke);
        const choisi = stocke === '' || valide ? stocke! : liste[0]?._id || '';
        setKiosqueId(choisi);
        setScopeCharge(scope);
        localStorage.setItem(`${CLE_STORAGE}:${scope}`, choisi);
        poserCookieKiosque(choisi);
      })
      .catch(() => {
        if (!cancelled) { setKiosques([]); setKiosqueId(''); setScopeCharge(scope); }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [scope, sessionLoading, version]);

  const changerKiosque = useCallback((id: string) => {
    if (!scope || (id && !kiosques.some((k) => k._id === id)) || id === kiosqueId) return;
    if (!window.dispatchEvent(new Event('ek-kiosque-avant-changement', { cancelable: true }))) return;
    setKiosqueId(id);
    localStorage.setItem(`${CLE_STORAGE}:${scope}`, id);
    poserCookieKiosque(id);
  }, [scope, kiosques, kiosqueId]);

  const visible = scopeCharge === scope && !!scope;
  return createElement(KiosqueContext.Provider, { value: {
    kiosques: visible ? kiosques : [], kiosqueId: visible ? kiosqueId : '',
    loading: sessionLoading || (!!scope && (!visible || loading)), changerKiosque, actualiserKiosques,
  } }, children);
}

export function useKiosque() {
  const contexte = useContext(KiosqueContext);
  if (!contexte) throw new Error('KiosqueProvider requis');
  return { ...contexte, kiosque: contexte.kiosques.find((k) => k._id === contexte.kiosqueId) || null };
}
