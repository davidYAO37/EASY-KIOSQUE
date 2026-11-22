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

export interface ScopeHorsLigne { _id: string; entrepriseId?: string | null }

function cleScope(cle: string, scope: ScopeHorsLigne): string {
  if (!scope.entrepriseId || !scope._id) throw new Error('Session entreprise requise pour la file hors-ligne');
  return `${cle}:${scope.entrepriseId}:${scope._id}`;
}

export function anciennesVentesHorsLigne(): number {
  if (typeof window === 'undefined') return 0;
  try { return JSON.parse(localStorage.getItem(CLE) || '[]').length; } catch { return 0; }
}

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
export function ventesRejetees(scope: ScopeHorsLigne): VenteRejetee[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(cleScope(CLE_REJETS, scope)) || "[]");
  } catch {
    return [];
  }
}

export function viderRejets(scope: ScopeHorsLigne) {
  localStorage.setItem(cleScope(CLE_REJETS, scope), "[]");
  window.dispatchEvent(new CustomEvent("ek-offline-change"));
}

function lireFile(scope: ScopeHorsLigne): VenteHorsLigne[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(cleScope(CLE, scope)) || "[]");
  } catch {
    return [];
  }
}

function ecrireFile(file: VenteHorsLigne[], scope: ScopeHorsLigne) {
  localStorage.setItem(cleScope(CLE, scope), JSON.stringify(file));
  window.dispatchEvent(new CustomEvent("ek-offline-change"));
}

export function compterVentesHorsLigne(scope: ScopeHorsLigne): number {
  return lireFile(scope).length;
}

/** Ventes en file pour un kiosque précis (la file est par appareil,
 *  pas par kiosque — un poste peut servir plusieurs kiosques). */
export function ventesHorsLignePourKiosque(kiosqueId: string, scope: ScopeHorsLigne): VenteHorsLigne[] {
  return lireFile(scope).filter((v) => v.payload?.kiosqueId === kiosqueId);
}

export function ajouterVenteHorsLigne(payload: Record<string, any>, totalEstime: number, scope: ScopeHorsLigne) {
  const file = lireFile(scope);
  // Même clé d'idempotence déjà présente = double-clic hors-ligne → pas de doublon
  if (file.some((v) => v.payload.idempotencyKey === payload.idempotencyKey)) return;
  file.push({
    payload,
    miseEnFileLe: new Date().toISOString(),
    nbLignes: (payload.lignes || []).length,
    totalEstime,
  });
  ecrireFile(file, scope);
}

export interface ResultatSync {
  envoyees: number;
  echecs: { message: string }[];
  restantes: number;
}

const synchronisations = new Map<string, Promise<ResultatSync>>();

/**
 * Rejoue les ventes en file dans l'ordre. Erreurs réseau → arrêt
 * (on retentera plus tard) ; erreurs métier (400/403) → la vente est
 * retirée et signalée (elle ne passerait jamais).
 */
export function synchroniserVentesHorsLigne(scope: ScopeHorsLigne): Promise<ResultatSync> {
  const cle = cleScope(CLE, scope);
  const enCours = synchronisations.get(cle);
  if (enCours) return enCours;
  const promesse = synchroniser(scope).finally(() => synchronisations.delete(cle));
  synchronisations.set(cle, promesse);
  return promesse;
}

async function synchroniser(scope: ScopeHorsLigne): Promise<ResultatSync> {
  const file = lireFile(scope);
  const echecs: { message: string }[] = [];
  const traitees = new Set<string>();
  let envoyees = 0;
  for (const v of file) {
    try {
      const me = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
      if (!me.ok) break;
      const session = await me.json();
      if (session.user?._id !== scope._id || session.user?.entrepriseId !== scope.entrepriseId) break;
      const res = await fetch("/api/ventes", {
        method: "POST",
        credentials: "include",
        headers: { 'Content-Type': 'application/json', 'x-ek-offline-user': scope._id, 'x-ek-offline-entreprise': scope.entrepriseId! },
        body: JSON.stringify({ ...v.payload, horsLigne: true, miseEnFileLe: v.miseEnFileLe }),
      });
      if (res.ok) {
        envoyees++;
        traitees.add(v.payload.idempotencyKey);
        continue;
      }
      if ([401, 402, 423, 429].includes(res.status)) break;
      if (res.status >= 400 && res.status < 500) {
        const data = await res.json().catch(() => ({}));
        if (data?.code === 'SESSION_MODIFIEE') break;
        const message = data?.message || `Rejetée (${res.status})`;
        echecs.push({ message });
        const rejets = ventesRejetees(scope);
        rejets.push({ ...v, message, rejeteeLe: new Date().toISOString() });
        localStorage.setItem(cleScope(CLE_REJETS, scope), JSON.stringify(rejets));
        traitees.add(v.payload.idempotencyKey);
        continue;
      }
      break; // 5xx : retenter plus tard
    } catch {
      break; // toujours hors-ligne
    }
  }
  const restantes = lireFile(scope).filter((v) => !traitees.has(v.payload.idempotencyKey));
  ecrireFile(restantes, scope);
  if (envoyees > 0) window.dispatchEvent(new Event('ek-donnees-change'));
  return { envoyees, echecs, restantes: restantes.length };
}
