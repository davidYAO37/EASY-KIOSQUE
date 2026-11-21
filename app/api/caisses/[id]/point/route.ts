import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { pointCaisseSchema } from "@/lib/validations";
import { declarerPoint } from "@/services/caisses.service";

/**
 * Point journalier déclaré par l'opérateur (vendeur inclus) : il saisit le
 * montant réellement compté ; l'écart est calculé côté serveur.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const autorise =
    hasActionPermission(user!, "ouvrir_caisse") ||
    hasActionPermission(user!, "enregistrer_vente") ||
    hasActionPermission(user!, "cloturer_caisse");
  if (!autorise) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  const parsed = pointCaisseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const { id } = await params;
  try {
    const session = await declarerPoint(user!, id, parsed.data);
    // Jamais de solde théorique renvoyé à un simple opérateur
    const controleur =
      hasActionPermission(user!, "cloturer_caisse") ||
      hasActionPermission(user!, "confirmer_remise");
    if (!controleur) {
      delete session.soldeTheorique;
      delete session.totalEntrees;
      delete session.totalSorties;
      delete session.points;
      delete session.pointEnAttente;
      delete session.remisesEnAttente;
    }
    return NextResponse.json({ session });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
