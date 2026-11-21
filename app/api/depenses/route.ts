import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { depenseSchema } from "@/lib/validations";
import { enregistrerDepense, listerDepenses } from "@/services/depenses.service";

/**
 * Liste des dépenses — contrôleurs (`annuler_depense`, `cloturer_caisse`,
 * `confirmer_remise`, comptable) : périmètre kiosques autorisés ;
 * opérateurs (`enregistrer_depense` seul) : leurs propres dépenses.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  const controleur =
    user!.type === "admin" ||
    user!.type === "gestionnaire" ||
    user!.type === "comptable" ||
    hasActionPermission(user!, "annuler_depense") ||
    hasActionPermission(user!, "cloturer_caisse") ||
    hasActionPermission(user!, "confirmer_remise");
  const operateur = hasActionPermission(user!, "enregistrer_depense");
  if (!controleur && !operateur) {
    return NextResponse.json({ message: "Accès refusé" }, { status: 403 });
  }

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerDepenses(user!, {
    kiosqueId: sp.get("kiosqueId") || undefined,
    categorieDepenseId: sp.get("categorieDepenseId") || undefined,
    statut: sp.get("statut") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    q: sp.get("q") || undefined,
    propresSeulement: !controleur,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}

/** Enregistrement d'une dépense — action `enregistrer_depense`. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["enregistrer_depense"],
  });
  if (error) return error;

  const parsed = depenseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const { depense, dupliquee } = await enregistrerDepense(user!, parsed.data);
    return NextResponse.json({ depense, dupliquee }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
