"use client";

import { Fragment, createContext, createElement, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { NotificationDTO } from '@/types/ventes';

export interface AuthUser {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string | null;
  type: string;
  entrepriseId?: string | null;
  kiosqueIds?: string[];
  permissions?: {
    services?: string[];
    actions?: string[];
    customized?: boolean;
  };
  /** Date/heure de connexion de la session courante (ISO, émission du JWT). */
  connecteDepuis?: string | null;
}

export interface AuthEntreprise {
  _id: string;
  nomSociete: string;
  nomCommercial?: string;
  devise: string;
  logo?: string;
  statut?: string;
  abonnement?: { planCode: string; planNom: string; statut: string; expireLe: string; joursRestants: number };
  stock?: { actif: boolean; venteSansStockAutorisee: boolean };
}

/** Récupère l'utilisateur connecté via /api/me (cookie JWT). */
interface Session {
  user: AuthUser | null;
  entreprise: AuthEntreprise | null;
  loading: boolean;
  erreur: boolean;
  actualiser: () => Promise<void>;
  effacer: () => void;
  notifications: NotificationDTO[];
  nonLues: number;
  actualiserNotifications: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState({ user: null as AuthUser | null, entreprise: null as AuthEntreprise | null, loading: true, erreur: false });
  const requete = useRef<AbortController | null>(null);
  const effacer = useCallback(() => {
    requete.current?.abort();
    setSession({ user: null, entreprise: null, loading: false, erreur: false });
  }, []);
  const actualiser = useCallback(async () => {
    requete.current?.abort();
    const controller = new AbortController();
    requete.current = controller;
    try {
      const res = await fetch("/api/me", { credentials: "include", cache: "no-store", signal: controller.signal });
      if (!res.ok && res.status !== 401) throw new Error("Session indisponible");
      const data = res.ok ? await res.json() : null;
      if (!controller.signal.aborted) setSession({ user: data?.user || null, entreprise: data?.entreprise || null, loading: false, erreur: false });
    } catch {
      if (!controller.signal.aborted) setSession({ user: null, entreprise: null, loading: false, erreur: true });
    }
  }, []);
  useEffect(() => {
    void actualiser();
    const verifier = () => { if (document.visibilityState === "visible") void actualiser(); };
    window.addEventListener("focus", verifier);
    document.addEventListener('visibilitychange', verifier);
    return () => { requete.current?.abort(); window.removeEventListener("focus", verifier); document.removeEventListener('visibilitychange', verifier); };
  }, [actualiser]);
  const scope = session.user ? `${session.user.entrepriseId || 'plateforme'}:${session.user._id}` : '';
  const [notifs, setNotifs] = useState({ scope: '', items: [] as NotificationDTO[], nonLues: 0 });
  const [versionNotifs, setVersionNotifs] = useState(0);
  const actualiserNotifications = useCallback(() => setVersionNotifs((v) => v + 1), []);
  const autorise = !!session.user?.entrepriseId && ['admin', 'gestionnaire'].includes(session.user.type);
  useEffect(() => {
    if (!autorise) return;
    let controller: AbortController | null = null;
    const charger = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      const courant = new AbortController();
      controller = courant;
      try {
        const res = await fetch('/api/notifications?limit=8', { credentials: 'include', cache: 'no-store', signal: courant.signal });
        if (!res.ok) return;
        const data = await res.json();
        if (!courant.signal.aborted) setNotifs({ scope, items: data.notifications || [], nonLues: data.nonLues || 0 });
      } catch {}
    };
    void charger();
    const timer = setInterval(charger, 30_000);
    document.addEventListener('visibilitychange', charger);
    return () => { controller?.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', charger); };
  }, [scope, autorise, versionNotifs]);
  return createElement(SessionContext.Provider, { value: { ...session, actualiser, effacer,
    notifications: autorise && notifs.scope === scope ? notifs.items : [],
    nonLues: autorise && notifs.scope === scope ? notifs.nonLues : 0, actualiserNotifications,
  } }, createElement(Fragment, { key: scope }, children));
}

export function useAuthUser() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("SessionProvider requis");
  const aAction = (code: string) =>
    !!session.user?.permissions?.actions?.includes("*") ||
    !!session.user?.permissions?.actions?.includes(code);
  return { ...session, aAction };
}
