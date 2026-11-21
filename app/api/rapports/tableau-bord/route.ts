import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { tableauDeBord } from "@/services/rapports.service";

/**
 * Données du tableau de bord — tout utilisateur du tenant.
 * Portée : `consulter_rapports` → vue complète ; sinon (vendeur/caissier)
 * → limitée à ses propres ventes (pas de créances, remises, dépenses).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  try {
    const data = await tableauDeBord(
      user!,
      req.nextUrl.searchParams.get("kiosqueId") || undefined
    );
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
