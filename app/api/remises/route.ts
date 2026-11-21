import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { remiseSchema } from "@/lib/validations";
import { declarerRemise, listerRemises } from "@/services/caisses.service";

/**
 * Remises d'argent — contrôleurs : tout le périmètre kiosque ;
 * opérateurs (vendeur) : leurs propres déclarations seulement.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const controleur =
    hasActionPermission(user!, "confirmer_remise") ||
    hasActionPermission(user!, "cloturer_caisse");
  const operateur = hasActionPermission(user!, "declarer_remise");
  if (!controleur && !operateur) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerRemises(user!, {
    kiosqueId: sp.get("kiosqueId") || undefined,
    statut: sp.get("statut") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    propresSeulement: !controleur,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 30,
  });
  return NextResponse.json(liste);
}

/**
 * Déclaration d'une remise — action `declarer_remise` (vendeur inclus).
 * Montant borné au disponible de caisse ; idempotence par clé.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["declarer_remise"],
  });
  if (error) return error;

  const parsed = remiseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const { remise, dupliquee } = await declarerRemise(user!, parsed.data);
    return NextResponse.json({ remise, dupliquee }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
