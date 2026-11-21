import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { listerCreances } from "@/services/credits.service";

/**
 * Suivi des créances — action `consulter_credits` requise
 * (propriétaire/gestionnaire/responsable/caissier/comptable ; pas le vendeur).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_credits"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerCreances(user!, {
    clientId: sp.get("clientId") || undefined,
    kiosqueId: sp.get("kiosqueId") || undefined,
    statut: sp.get("statut") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}
