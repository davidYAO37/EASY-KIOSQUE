import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { categorieDepenseUpdateSchema } from "@/lib/validations";
import { modifierCategorieDepense } from "@/services/depenses.service";

/** Mise à jour d'une catégorie de dépense — admin/gestionnaire. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"]);
  if (error) return error;

  const parsed = categorieDepenseUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const { id } = await params;
  try {
    const categorie = await modifierCategorieDepense(user!, id, parsed.data);
    return NextResponse.json({ categorie });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
