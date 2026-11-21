"use client";

import { useEffect } from "react";

/**
 * Enregistre le service worker PWA — en production uniquement.
 * En développement, tout SW existant est désenregistré et son cache
 * vidé : sinon les chunks `/_next/static` réutilisent les mêmes noms
 * et le navigateur exécute d'anciens builds (UI périmée).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const r of regs) r.unregister();
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }
      return;
    }

    navigator.serviceWorker.register("/sw-pwa.js").catch(() => {});
  }, []);
  return null;
}
