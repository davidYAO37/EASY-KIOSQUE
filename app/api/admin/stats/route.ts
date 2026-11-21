import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Entreprise } from "@/models/entreprise";
import { User } from "@/models/users.model";
import { Kiosque } from "@/models/kiosque";
import { Vente } from "@/models/vente";
import { Plan } from "@/models/plan";
import { PaiementAbonnement } from "@/models/paiementAbonnement";
import { JournalConnexion } from "@/models/journalConnexion";
import { etatAbonnement } from "@/lib/abonnement";

/**
 * Tableau de bord plateforme (super-admin) : métriques SaaS globales —
 * entreprises, abonnements, revenus enregistrés, activité.
 * Aucune donnée métier des tenants n'est exposée.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  await db();
  const maintenant = new Date();
  const il7j = new Date(maintenant.getTime() - 7 * 86400_000);
  const il30j = new Date(maintenant.getTime() - 30 * 86400_000);
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

  const [
    nbEntreprises, nbSuspendues, nbUtilisateurs, nbKiosques,
    nouvelles7j, nouvelles30j, plans, revenusMois, revenusTotal, connexions7j,
  ] = await Promise.all([
    Entreprise.countDocuments(),
    Entreprise.countDocuments({ statut: "suspendu" }),
    User.countDocuments({ entrepriseId: { $ne: null } }),
    Kiosque.countDocuments(),
    Entreprise.countDocuments({ createdAt: { $gte: il7j } }),
    Entreprise.countDocuments({ createdAt: { $gte: il30j } }),
    Plan.find().sort({ prixMensuel: 1 }).lean(),
    PaiementAbonnement.aggregate([
      { $match: { createdAt: { $gte: debutMois } } },
      { $group: { _id: null, total: { $sum: "$montant" } } },
    ]),
    PaiementAbonnement.aggregate([
      { $group: { _id: null, total: { $sum: "$montant" } } },
    ]),
    JournalConnexion.countDocuments({ createdAt: { $gte: il7j }, statut: "success" }),
  ]);

  // Répartition des entreprises par plan + expirations proches
  const entreprises = await Entreprise.find()
    .select("abonnementPlan abonnementExpireLe statut")
    .lean();
  const parPlan: Record<string, number> = {};
  let enEssai = 0, expires = 0, enGrace = 0, expirant7j = 0;
  for (const e of entreprises) {
    const doc = await Entreprise.findById(e._id);
    const etat = doc ? await etatAbonnement(doc) : null;
    if (!etat) continue;
    parPlan[etat.planCode] = (parPlan[etat.planCode] || 0) + 1;
    if (etat.statut === "essai") enEssai++;
    else if (etat.statut === "expire") expires++;
    else if (etat.statut === "grace") enGrace++;
    if (etat.statut !== "expire" && etat.joursRestants <= 7) expirant7j++;
  }

  // Volume de ventes plateforme (compteurs uniquement — pas de détail métier)
  const [nbVentes, volumeVentes] = await Promise.all([
    Vente.countDocuments({ statut: "validee" }),
    Vente.aggregate([
      { $match: { statut: "validee" } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
  ]);

  return NextResponse.json({
    entreprises: {
      total: nbEntreprises,
      suspendues: nbSuspendues,
      actives: nbEntreprises - nbSuspendues,
      nouvelles7j,
      nouvelles30j,
      enEssai,
      enGrace,
      expirees: expires,
      expirant7j,
      parPlan,
    },
    utilisateurs: nbUtilisateurs,
    kiosques: nbKiosques,
    ventes: {
      total: nbVentes,
      volume: volumeVentes[0]?.total || 0,
    },
    revenus: {
      mois: revenusMois[0]?.total || 0,
      total: revenusTotal[0]?.total || 0,
    },
    connexions7j,
    plans,
  });
}
