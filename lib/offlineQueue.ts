/**
 * File d'attente hors-ligne des ventes (mode dégradé POS).
 *
 * Quand le réseau tombe, le vendeur continue d'encaisser : chaque vente
 * est stockée localement avec SA clé d'idempotence déjà générée, puis
 * rejouée telle quelle au retour du réseau. La clé garantit qu'une
 * vente n'est jamais enregistrée deux fois côté serveur — même si la
 * première requête avait en fait abouti sans que la réponse arrive.
 *
 * Limite assumée : les prix sont re-lus serveur à la synchro — si un
 * prix a changé entre-temps, le total réel peut différer du panier
 * affiché hors-ligne (accepté : le tarif officiel prime toujours).
 */

const CLE = "ek_offline_ventes";
const CLE_REJETS = "ek_offline_rejets";

export interface VenteHorsLigne {
  payload: Record<string, any>;
  miseEnFileLe: string;
  nbLignes: number;
  totalEstime: number;
}

export interface VenteRejetee extends VenteHorsLigne {
  message: string;
  rejeteeLe: string;
}

/** Ventes définitivement rejetées par le serveur (ex : caisse fermée).
 *  Conservées à l'écran du vendeur — le propriétaire est aussi notifié
 *  côté serveur, la preuve ne disparaît pas. */
export function ventesRejetees(): VenteRejetee[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CLE_REJETS) || "[]");
  } catch {
    return [];
  }
}

export function viderRejets() {
  localStorage.setItem(CLE_REJETS, "[]");
  window.dispatchEvent(new CustomEvent("ek-offline-change"));
}

function lireFile(): VenteHorsLigne[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CLE) || "[]");
  } catch {
    return [];
  }
}

function ecrireFile(file: VenteHorsLigne[]) {
  localStorage.setItem(CLE, JSON.stringify(file));
  window.dispatchEvent(new CustomEvent("ek-offline-change", { detail: file.length }));
}

export function compterVentesHorsLigne(): number {
  return lireFile().length;
}

/** Ventes en file pour un kiosque précis (la file est par appareil,
 *  pas par kiosque — un poste peut servir plusieurs kiosques). */
export function ventesHorsLignePourKiosque(kiosqueId: string): VenteHorsLigne[] {
  return lireFile().filter((v) => v.payload?.kiosqueId === kiosqueId);
}

export function ajouterVenteHorsLigne(payload: Record<string, any>, totalEstime: number) {
  const file = lireFile();
  // Même clé d'idempotence déjà présente = double-clic hors-ligne → pas de doublon
  if (file.some((v) => v.payload.idempotencyKey === payload.idempotencyKey)) return;
  file.push({
    payload,
    miseEnFileLe: new Date().toISOString(),
    nbLignes: (payload.lignes || []).length,
    totalEstime,
  });
  ecrireFile(file);
}

export interface ResultatSync {
  envoyees: number;
  echecs: { message: string }[];
  restantes: number;
}

/**
 * Rejoue les ventes en file dans l'ordre. Erreurs réseau → arrêt
 * (on retentera plus tard) ; erreurs métier (400/403) → la vente est
 * retirée et signalée (elle ne passerait jamais).
 */
export async function synchroniserVentesHorsLigne(): Promise<ResultatSync> {
  const file = lireFile();
  const echecs: { message: string }[] = [];
  let envoyees = 0;

  const restantes: VenteHorsLigne[] = [];
  for (const v of file) {
    try {
      const res = await fetch("/api/ventes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v.payload, horsLigne: true, miseEnFileLe: v.miseEnFileLe }),
      });
      if (res.ok) {
        envoyees++;
        continue;
      }
      if (res.status >= 400 && res.status < 500) {
        const data = await res.json().catch(() => ({}));
        const message = data?.message || `Rejetée (${res.status})`;
        echecs.push({ message });
        const rejets = ventesRejetees();
        rejets.push({ ...v, message, rejeteeLe: new Date().toISOString() });
        localStorage.setItem(CLE_REJETS, JSON.stringify(rejets));
        continue;
      }
      restantes.push(v); // 5xx : retenter plus tard
    } catch {
      restantes.push(v); // toujours hors-ligne
      restantes.push(...file.slice(file.indexOf(v) + 1));
      break;
    }
  }
  ecrireFile(restantes);
  return { envoyees, echecs, restantes: restantes.length };
}
