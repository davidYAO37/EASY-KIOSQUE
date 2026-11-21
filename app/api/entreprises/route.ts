import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Entreprise } from "@/models/entreprise";
import { Kiosque } from "@/models/kiosque";
import { User } from "@/models/users.model";

/**
 * Administration plateforme (super-admin) : liste de toutes les
 * entreprises inscrites avec leurs compteurs. Les données métier des
 * entreprises ne sont JAMAIS exposées ici — uniquement la fiche tenant.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  await db();
  const { etatAbonnement } = await import("@/lib/abonnement");
  const entreprises = await Entreprise.find().sort({ createdAt: -1 });

  const avecCompteurs = await Promise.all(
    entreprises.map(async (e) => {
      const [nbKiosques, nbUtilisateurs, abo] = await Promise.all([
        Kiosque.countDocuments({ entrepriseId: e._id }),
        User.countDocuments({ entrepriseId: e._id }),
        etatAbonnement(e),
      ]);
      return {
        ...e.toObject(),
        _id: e._id.toString(),
        nbKiosques,
        nbUtilisateurs,
        abonnement: {
          planCode: abo.planCode,
          planNom: abo.planNom,
          statut: abo.statut,
          expireLe: abo.expireLe,
          joursRestants: abo.joursRestants,
        },
      };
    })
  );

  return NextResponse.json({ entreprises: avecCompteurs });
}
