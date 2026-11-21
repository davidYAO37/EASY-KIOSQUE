import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { mouvementsSession } from "@/services/caisses.service";

/** Mouvements détaillés d'une session — profils de contrôle uniquement. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const controleur =
    hasActionPermission(user!, "cloturer_caisse") ||
    hasActionPermission(user!, "confirmer_remise");
  if (!controleur) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  await db();
  const { id } = await params;
  try {
    const mouvements = await mouvementsSession(user!, id);
    return NextResponse.json({ mouvements });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
