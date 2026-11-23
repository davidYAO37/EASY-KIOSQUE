import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { listerMouvements } from "@/services/stock.service";

/**
 * Journal des mouvements de stock (entrées, ventes, restitutions,
 * ajustements) — action `consulter_stock`.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_stock"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  try {
    const res = await listerMouvements(user!, {
      kiosqueId: sp.get("kiosqueId") || undefined,
      produitId: sp.get("produitId") || undefined,
      du: sp.get("du") || undefined,
      au: sp.get("au") || undefined,
      page: Number(sp.get("page")) || 1,
      limit: Number(sp.get("limit")) || 30,
    });
    return NextResponse.json(res);
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || "Erreur", code: e.code },
      { status: e.status || 500 }
    );
  }
}
