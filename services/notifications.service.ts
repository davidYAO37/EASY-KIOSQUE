import { Types } from "mongoose";
import { Notification } from "@/models/notification";
import { Kiosque } from "@/models/kiosque";
import type { CurrentUser } from "@/lib/auth";
import type { NotificationDTO } from "@/types/ventes";

/**
 * Notifications propriétaire — centre de notifications.
 * Une notification n'est créée qu'APRÈS enregistrement effectif en base
 * (jamais avant la fin de la transaction de vente).
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

/** Le centre de notifications est réservé au propriétaire et à ses gestionnaires. */
export function peutVoirNotifications(user: CurrentUser): boolean {
  return (
    user.type === "admin" ||
    user.type === "gestionnaire" ||
    user.permissions.actions.includes("*")
  );
}

export async function creerNotification(data: {
  entrepriseId: string | Types.ObjectId;
  kiosqueId?: string | Types.ObjectId | null;
  type: "vente" | "annulation_vente" | "remboursement" | "caisse" | "depense" | "info";
  titre: string;
  message: string;
  venteId?: string | Types.ObjectId | null;
  numeroVente?: string;
  montant?: number;
  vendeurId?: string | Types.ObjectId | null;
  vendeurNom?: string;
}) {
  return Notification.create({
    entrepriseId: oid(data.entrepriseId),
    kiosqueId: data.kiosqueId ? oid(data.kiosqueId) : null,
    type: data.type,
    titre: data.titre,
    message: data.message,
    venteId: data.venteId ? oid(data.venteId) : null,
    numeroVente: data.numeroVente,
    montant: data.montant,
    vendeurId: data.vendeurId ? oid(data.vendeurId) : null,
    vendeurNom: data.vendeurNom,
  });
}

export interface FiltresNotifications {
  kiosqueId?: string;
  lues?: "0" | "1"; // "0" = non lues seulement
  du?: string;
  au?: string;
  limit?: number;
}

export async function listerNotifications(
  user: CurrentUser,
  f: FiltresNotifications
): Promise<{ notifications: NotificationDTO[]; nonLues: number }> {
  const eid = oid(user.entrepriseId!);
  const filtre: any = { entrepriseId: eid };
  if (f.kiosqueId && Types.ObjectId.isValid(f.kiosqueId)) {
    filtre.kiosqueId = oid(f.kiosqueId);
  }
  if (f.du || f.au) {
    filtre.createdAt = {};
    if (f.du) filtre.createdAt.$gte = new Date(f.du);
    if (f.au) {
      const fin = new Date(f.au);
      fin.setHours(23, 59, 59, 999);
      filtre.createdAt.$lte = fin;
    }
  }
  const uid = oid(user._id);
  if (f.lues === "0") filtre.lusPar = { $ne: uid };

  const [liste, nonLues] = await Promise.all([
    Notification.find(filtre).sort({ createdAt: -1 }).limit(f.limit || 50).lean(),
    Notification.countDocuments({ entrepriseId: eid, lusPar: { $ne: uid } }),
  ]);

  // Noms des kiosques pour l'affichage
  const kIds = [...new Set(liste.filter((n) => n.kiosqueId).map((n) => n.kiosqueId!.toString()))];
  const kiosques = kIds.length
    ? await Kiosque.find({ _id: { $in: kIds.map(oid) }, entrepriseId: eid })
        .select("code designation")
        .lean()
    : [];
  const parKiosque = new Map(kiosques.map((k) => [k._id.toString(), k.designation]));

  return {
    notifications: liste.map((n) => ({
      _id: n._id.toString(),
      type: n.type,
      titre: n.titre,
      message: n.message,
      venteId: n.venteId?.toString() || null,
      numeroVente: n.numeroVente,
      montant: n.montant,
      vendeurNom: n.vendeurNom,
      kiosqueId: n.kiosqueId?.toString() || null,
      kiosqueNom: n.kiosqueId ? parKiosque.get(n.kiosqueId.toString()) : undefined,
      lue: (n.lusPar || []).some((u: any) => u.toString() === user._id),
      createdAt: n.createdAt?.toISOString?.(),
    })),
    nonLues,
  };
}

export async function marquerLue(user: CurrentUser, id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return Notification.findOneAndUpdate(
    { _id: oid(id), entrepriseId: oid(user.entrepriseId!) },
    { $addToSet: { lusPar: oid(user._id) } },
    { new: true }
  ).lean();
}

export async function toutMarquerLues(user: CurrentUser) {
  return Notification.updateMany(
    { entrepriseId: oid(user.entrepriseId!), lusPar: { $ne: oid(user._id) } },
    { $addToSet: { lusPar: oid(user._id) } }
  );
}
