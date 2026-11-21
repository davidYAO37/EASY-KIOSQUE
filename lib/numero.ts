import { Types, type ClientSession } from "mongoose";
import { Sequence } from "@/models/sequence";

/**
 * Numérotation séquentielle multi-tenant, atomique (findOneAndUpdate $inc).
 * Un compteur par (entrepriseId, kiosqueId, clé) — la numérotation peut donc
 * être distincte par kiosque. Ex: VTE-2026-0001.
 *
 * À privilégier dans une transaction MongoDB pour les opérations
 * financières (ventes, paiements, remboursements).
 */
export async function nextNumero(
  entrepriseId: string | Types.ObjectId,
  cle: string,
  prefixe: string,
  opts: { kiosqueId?: string | Types.ObjectId | null; session?: ClientSession } = {}
): Promise<string> {
  const seq = await Sequence.findOneAndUpdate(
    {
      entrepriseId: new Types.ObjectId(String(entrepriseId)),
      kiosqueId: opts.kiosqueId ? new Types.ObjectId(String(opts.kiosqueId)) : null,
      cle,
    },
    { $inc: { valeur: 1 } },
    { upsert: true, new: true, session: opts.session }
  ).lean();

  const annee = new Date().getFullYear();
  return `${prefixe}-${annee}-${String(seq?.valeur || 1).padStart(4, "0")}`;
}

/** Formate un montant en FCFA lisible (1 234 567). */
export function formatMontant(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n || 0));
}
