import { Types } from "mongoose";
import { Client } from "@/models/client";
import { Creance } from "@/models/creance";
import { Sequence } from "@/models/sequence";
import type { ClientDTO } from "@/types/ventes";

/**
 * Service métier clients — toutes les requêtes bornées au tenant.
 * Les clients occasionnels n'ont pas de fiche : ce module concerne les
 * clients identifiés (obligatoire pour une vente à crédit).
 */

function oid(id: string | Types.ObjectId) {
  return new Types.ObjectId(String(id));
}

/** Code auto garanti unique : CL001, CL002… (compteur `sequences`). */
async function codeClient(entrepriseId: Types.ObjectId): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const seq = await Sequence.findOneAndUpdate(
      { entrepriseId, kiosqueId: null, cle: "code_client" },
      { $inc: { valeur: 1 } },
      { upsert: true, new: true }
    ).lean();
    const code = `CL${String(seq?.valeur || 1).padStart(3, "0")}`;
    const existe = await Client.exists({ entrepriseId, code });
    if (!existe) return code;
  }
  throw new Error("Impossible de générer un code client unique");
}

export interface FiltresClients {
  q?: string;
  statut?: string;
  page?: number;
  limit?: number;
}

function filtreClients(entrepriseId: string, f: FiltresClients) {
  const filtre: any = { entrepriseId: oid(entrepriseId) };
  if (f.q) {
    const r = new RegExp(f.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filtre.$or = [{ nom: r }, { prenoms: r }, { code: r }, { telephone: r }];
  }
  if (f.statut === "actif" || f.statut === "inactif") filtre.statut = f.statut;
  return filtre;
}

/** Soldes dus par client (créances non soldées). */
async function soldesClients(eid: Types.ObjectId, clientIds: Types.ObjectId[]) {
  const aggr = await Creance.aggregate([
    {
      $match: {
        entrepriseId: eid,
        clientId: { $in: clientIds },
        statut: { $in: ["non_paye", "partielle"] },
      },
    },
    { $group: { _id: "$clientId", total: { $sum: "$solde" } } },
  ]);
  return new Map(aggr.map((r) => [String(r._id), r.total as number]));
}

function versDTO(c: any, soldeDu = 0): ClientDTO {
  return {
    _id: c._id.toString(),
    code: c.code,
    nom: c.nom,
    prenoms: c.prenoms,
    telephone: c.telephone,
    adresse: c.adresse,
    plafondCredit: c.plafondCredit ?? null,
    statut: c.statut,
    soldeDu,
    createdAt: c.createdAt?.toISOString?.(),
  };
}

export async function listerClients(entrepriseId: string, f: FiltresClients) {
  const eid = oid(entrepriseId);
  const page = Math.max(1, f.page || 1);
  const limit = Math.min(100, Math.max(1, f.limit || 20));
  const filtre = filtreClients(entrepriseId, f);

  const [total, clients] = await Promise.all([
    Client.countDocuments(filtre),
    Client.find(filtre)
      .sort({ nom: 1, prenoms: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const soldes = await soldesClients(eid, clients.map((c) => c._id));
  return {
    clients: clients.map((c) => versDTO(c, soldes.get(c._id.toString()) || 0)),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    limit,
  };
}

/** Recherche courte pour les sélecteurs (POS, vente à crédit). */
export async function chercherClients(entrepriseId: string, q: string) {
  const eid = oid(entrepriseId);
  const filtre = filtreClients(entrepriseId, { q, statut: "actif" });
  const clients = await Client.find(filtre).sort({ nom: 1 }).limit(15).lean();
  const soldes = await soldesClients(eid, clients.map((c) => c._id));
  return clients.map((c) => versDTO(c, soldes.get(c._id.toString()) || 0));
}

export async function detailClient(entrepriseId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  const c = await Client.findOne({
    _id: oid(id),
    entrepriseId: oid(entrepriseId),
  }).lean();
  if (!c) return null;
  const soldes = await soldesClients(oid(entrepriseId), [c._id]);
  return versDTO(c, soldes.get(c._id.toString()) || 0);
}

export async function creerClient(entrepriseId: string, data: any) {
  const eid = oid(entrepriseId);
  const code =
    (data.code || "").toUpperCase().trim() || (await codeClient(eid));
  const doublon = await Client.findOne({ entrepriseId: eid, code })
    .select("_id")
    .lean();
  if (doublon) {
    const err: any = new Error(`Le code client « ${code} » existe déjà.`);
    err.status = 409;
    throw err;
  }
  const c = await Client.create({
    entrepriseId: eid,
    code,
    nom: data.nom,
    prenoms: data.prenoms || undefined,
    telephone: data.telephone || undefined,
    adresse: data.adresse || undefined,
    plafondCredit: data.plafondCredit ?? null,
    statut: data.statut || "actif",
  });
  return versDTO(c.toObject(), 0);
}

export async function majClient(entrepriseId: string, id: string, data: any) {
  const eid = oid(entrepriseId);
  const $set: any = { ...data };
  if ($set.code !== undefined) {
    $set.code = $set.code.toUpperCase().trim();
    const doublon = await Client.findOne({
      entrepriseId: eid,
      code: $set.code,
      _id: { $ne: oid(id) },
    })
      .select("_id")
      .lean();
    if (doublon) {
      const err: any = new Error(`Le code client « ${$set.code} » existe déjà.`);
      err.status = 409;
      throw err;
    }
  }
  const c = await Client.findOneAndUpdate(
    { _id: oid(id), entrepriseId: eid },
    { $set },
    { new: true }
  ).lean();
  if (!c) return null;
  const soldes = await soldesClients(eid, [c._id]);
  return versDTO(c, soldes.get(c._id.toString()) || 0);
}

/**
 * Désactivation (soft-delete) : un client ayant des créances ou des ventes
 * ne disparaît jamais physiquement — l'historique est inaltérable.
 */
export async function desactiverClient(entrepriseId: string, id: string) {
  return Client.findOneAndUpdate(
    { _id: oid(id), entrepriseId: oid(entrepriseId) },
    { $set: { statut: "inactif" } },
    { new: true }
  ).lean();
}
