import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { listerNiveaux } from "@/services/stock.service";

/**
 * Niveaux de stock par kiosque — produits REVENTE actifs.
 * Consultation réservée `consulter_stock` (admin/gestionnaire/responsable/
 * comptable par défaut).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_stock"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  try {
    const res = await listerNiveaux(user!, {
      kiosqueId: sp.get("kiosqueId") || undefined,
      q: sp.get("q") || undefined,
    });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || "Erreur", code: e.code },
      { status: e.status || 500 }
    );
  }
}
