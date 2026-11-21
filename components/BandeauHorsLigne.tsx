"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { compterVentesHorsLigne, synchroniserVentesHorsLigne, ventesRejetees } from "@/lib/offlineQueue";

/**
 * Bandeau d'état réseau + ventes en attente de synchronisation.
 * - Hors-ligne : indicateur persistant, le POS continue d'encaisser.
 * - Retour réseau : synchronisation automatique de la file locale.
 */
export default function BandeauHorsLigne() {
  const [enLigne, setEnLigne] = useState(true);
  const [enAttente, setEnAttente] = useState(0);
  const [nbRejets, setNbRejets] = useState(0);
  const [syncEnCours, setSyncEnCours] = useState(false);
  // Garde anti-réentrance par ref — ne doit JAMAIS figurer dans les
  // dépendances de l'effet (boucle infinie sinon).
  const syncRef = useRef(false);

  const synchroniser = useCallback(async () => {
    if (syncRef.current || !navigator.onLine) return;
    if (compterVentesHorsLigne() === 0) return;
    syncRef.current = true;
    setSyncEnCours(true);
    try {
      const res = await synchroniserVentesHorsLigne();
      if (res.envoyees > 0) {
        toast.success(`${res.envoyees} vente(s) hors-ligne synchronisée(s) au serveur`);
      }
      for (const e of res.echecs) {
        toast.error(`Vente hors-ligne rejetée (tracée côté serveur) : ${e.message}`);
      }
      setEnAttente(res.restantes);
      setNbRejets(ventesRejetees().length);
    } finally {
      syncRef.current = false;
      setSyncEnCours(false);
    }
  }, []);

  useEffect(() => {
    const onOnline = () => { setEnLigne(true); synchroniser(); };
    const onOffline = () => setEnLigne(false);
    const onChange = (e: Event) =>
      setEnAttente((e as CustomEvent).detail ?? compterVentesHorsLigne());

    setEnLigne(navigator.onLine);
    setEnAttente(compterVentesHorsLigne());
    setNbRejets(ventesRejetees().length);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("ek-offline-change", onChange);
    // Si des ventes attendaient d'une session précédente → sync au chargement
    synchroniser();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("ek-offline-change", onChange);
    };
  }, [synchroniser]);

  if (enLigne && enAttente === 0 && nbRejets === 0) return null;

  if (enLigne && nbRejets > 0 && enAttente === 0) {
    return (
      <div className="alert alert-danger py-2 px-3 mb-3 small" role="alert">
        <i className="bi bi-exclamation-octagon me-2"></i>
        <strong>{nbRejets} vente(s) hors-ligne refusée(s) par le serveur.</strong>
        {" "}Elles sont conservées sur cet appareil et ont été signalées au propriétaire.
        Vérifiez la caisse ou contactez votre responsable.
      </div>
    );
  }

  return (
    <div
      className={`alert py-2 px-3 mb-3 small d-flex align-items-center justify-content-between ${
        enLigne ? "alert-warning" : "alert-danger"
      }`}
      role="alert"
    >
      <div>
        {!enLigne && (
          <>
            <i className="bi bi-wifi-off me-2"></i>
            <strong>Mode hors-ligne</strong> — les ventes sont enregistrées localement
            et seront synchronisées automatiquement au retour du réseau.
          </>
        )}
        {enLigne && enAttente > 0 && (
          <>
            <i className="bi bi-cloud-arrow-up me-2"></i>
            {syncEnCours ? "Synchronisation en cours..." : `${enAttente} vente(s) en attente de synchronisation.`}
          </>
        )}
      </div>
      {enAttente > 0 && !syncEnCours && enLigne && (
        <button className="btn btn-sm btn-outline-dark ms-3" onClick={synchroniser}>
          Synchroniser ({enAttente})
        </button>
      )}
      {!enLigne && enAttente > 0 && (
        <span className="badge bg-dark ms-3">{enAttente} en attente</span>
      )}
    </div>
  );
}
