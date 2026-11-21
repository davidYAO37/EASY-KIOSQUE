import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { clotureCaisseSchema } from "@/lib/validations";
import { rejeterPoint } from "@/services/caisses.service";

/**
 * Rejet du point journalier (`cloturer_caisse`) : la caisse repasse
 * `ouverte` et l'opérateur peut refaire son comptage. La déclaration
 * rejetée est conservée dans l'historique des points.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["cloturer_caisse"],
  });
  if (error) return error;

  const parsed = clotureCaisseSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const { id } = await params;
  try {
    const session = await rejeterPoint(user!, id, parsed.data.commentaire);
    return NextResponse.json({ session });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
