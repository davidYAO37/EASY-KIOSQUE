import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { detailDepense } from "@/services/depenses.service";

/** Détail d'une dépense — même portée que la liste. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const autorise =
    hasActionPermission(user!, "enregistrer_depense") ||
    hasActionPermission(user!, "annuler_depense") ||
    ["admin", "gestionnaire", "responsable", "comptable"].includes(user!.type);
  if (!autorise) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  await db();
  const { id } = await params;
  try {
    const depense = await detailDepense(user!, id);
    return NextResponse.json({ depense });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
