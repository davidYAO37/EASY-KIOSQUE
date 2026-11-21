import { Types } from "mongoose";
import { Kiosque } from "@/models/kiosque";
import type { CurrentUser } from "@/lib/auth";

/**
 * Isolation multi-tenant EASY-KIOSQUE.
 *
 * Règle absolue : l'entreprise est identifiée depuis la session serveur
 * (JWT → User.entrepriseId), JAMAIS depuis un identifiant envoyé librement
 * par le navigateur. Toutes les requêtes métier doivent passer par
 * `filtreTenant` / `verifierKiosque`.
 */

/** Filtre de base à appliquer à toute requête métier. */
export function filtreTenant(user: CurrentUser, extra: Record<string, any> = {}) {
  if (!user.entrepriseId) {
    throw new Error("TENANT_REQUIS");
  }
  return { entrepriseId: new Types.ObjectId(user.entrepriseId), ...extra };
}

/**
 * Un utilisateur n'a accès qu'aux kiosques auxquels il est affecté.
 * Règle : `kiosqueIds` vide = accès à tous les kiosques de l'entreprise
 * (comportement par défaut pour admin/gestionnaire) ; une liste non vide
 * restreint l'accès aux kiosques cités.
 */
export function kiosqueAccessible(user: CurrentUser, kiosqueId: string): boolean {
  if (!user.kiosqueIds?.length) return true;
  return user.kiosqueIds.includes(kiosqueId);
}

/**
 * Vérifie qu'un kiosque existe, appartient à l'entreprise du compte et est
 * accessible par l'utilisateur. Retourne le document ou null.
 */
export async function verifierKiosque(user: CurrentUser, kiosqueId: string) {
  if (!user.entrepriseId || !Types.ObjectId.isValid(kiosqueId)) return null;
  if (!kiosqueAccessible(user, kiosqueId)) return null;
  return Kiosque.findOne({
    _id: new Types.ObjectId(kiosqueId),
    entrepriseId: new Types.ObjectId(user.entrepriseId),
  }).lean();
}

/**
 * Variante stricte : exige un kiosqueId valide et appartenant au tenant.
 * À utiliser pour toute écriture rattachée à un point de vente.
 */
export async function exigerKiosque(user: CurrentUser, kiosqueId: any) {
  const kiosque =
    typeof kiosqueId === "string" ? await verifierKiosque(user, kiosqueId) : null;
  if (!kiosque) {
    const err: any = new Error("Kiosque introuvable ou non autorisé");
    err.code = "KIOSQUE_INVALIDE";
    err.status = 404;
    throw err;
  }
  return kiosque;
}

/** Liste des kiosques visibles par l'utilisateur dans son entreprise. */
export async function kiosquesAutorises(user: CurrentUser) {
  if (!user.entrepriseId) return [];
  const filtre: any = { entrepriseId: new Types.ObjectId(user.entrepriseId) };
  if (user.kiosqueIds?.length) {
    filtre._id = { $in: user.kiosqueIds.map((id) => new Types.ObjectId(id)) };
  }
  return Kiosque.find(filtre).sort({ designation: 1 }).lean();
}
