import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { hasActionPermission } from "@/lib/permissions";
import { db } from "@/db/mongoConnect";
import { categorieDepenseSchema } from "@/lib/validations";
import {
  creerCategorieDepense,
  listerCategoriesDepenses,
} from "@/services/depenses.service";

/** Catégories de dépenses — lisibles par les opérateurs autorisés aux dépenses. */
export async function GET(req: NextRequest) {
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
  const tout = req.nextUrl.searchParams.get("tout") === "1";
  const categories = await listerCategoriesDepenses(user!, tout);
  return NextResponse.json({ categories });
}

/** Création — réservée au paramétrage (admin/gestionnaire). */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"]);
  if (error) return error;

  const parsed = categorieDepenseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const categorie = await creerCategorieDepense(user!, parsed.data);
    return NextResponse.json({ categorie }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
