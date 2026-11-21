import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { categorieSchema } from "@/lib/validations";
import { creerCategorie, listerCategories } from "@/services/catalogue.service";

/** Catalogue lisible par tout utilisateur du tenant (utile au POS). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const categories = await listerCategories(user!.entrepriseId!);
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["gerer_produits"],
  });
  if (error) return error;

  const parsed = categorieSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const categorie = await creerCategorie(user!.entrepriseId!, parsed.data);
    return NextResponse.json({ categorie }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}
