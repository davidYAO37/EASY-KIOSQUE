import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { caisseActuelle } from "@/services/caisses.service";

/**
 * Session de caisse active d'un kiosque.
 * Opérateurs (vendeur/caissier) : existence + infos de base — le solde
 * théorique et les écarts sont masqués (comptage à l'aveugle).
 * Contrôleurs (cloturer_caisse / confirmer_remise) : soldes complets.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const controleur =
    hasActionPermission(user!, "cloturer_caisse") ||
    hasActionPermission(user!, "confirmer_remise");
  const operateur =
    hasActionPermission(user!, "ouvrir_caisse") ||
    hasActionPermission(user!, "enregistrer_vente");
  if (!controleur && !operateur) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  const kiosqueId = req.nextUrl.searchParams.get("kiosqueId");
  if (!kiosqueId) {
    return NextResponse.json({ message: "kiosqueId requis" }, { status: 400 });
  }

  await db();
  try {
    const session = await caisseActuelle(user!, kiosqueId);
    if (session && !controleur) {
      // Le vendeur compte sans connaître le théorique attendu
      delete session.soldeTheorique;
      delete session.totalEntrees;
      delete session.totalSorties;
      delete session.points;
      delete session.pointEnAttente;
      delete session.remisesEnAttente;
    }
    return NextResponse.json({ session, controleur });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
