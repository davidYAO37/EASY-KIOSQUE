import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { produitSchema } from "@/lib/validations";
import { creerProduit, listerProduits } from "@/services/catalogue.service";

/**
 * Liste paginée + filtrée du catalogue.
 * Lecture ouverte à tout utilisateur du tenant (le POS en a besoin).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerProduits(user!.entrepriseId!, {
    q: sp.get("q") || undefined,
    categorieId: sp.get("categorieId") || undefined,
    typeProduit: sp.get("typeProduit") || undefined,
    statut: sp.get("statut") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["gerer_produits"],
  });
  if (error) return error;

  const parsed = produitSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const produit = await creerProduit(user!.entrepriseId!, parsed.data);
    return NextResponse.json({ produit }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}
