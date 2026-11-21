import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { listerSessions } from "@/services/caisses.service";

/** Historique des sessions de caisse — profils de contrôle uniquement. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const controleur =
    hasActionPermission(user!, "cloturer_caisse") ||
    hasActionPermission(user!, "confirmer_remise");
  if (!controleur) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerSessions(user!, {
    kiosqueId: sp.get("kiosqueId") || undefined,
    statut: sp.get("statut") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}
