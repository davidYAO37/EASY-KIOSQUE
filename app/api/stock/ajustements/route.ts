import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { stockAjustementSchema } from "@/lib/validations";
import { ajusterStock, ajustementsStock } from "@/services/stock.service";

/**
 * Ajustement de stock : fixe le niveau au stock réel compté.
 * Le delta (avant → après) est tracé dans les mouvements avec le motif.
 * Action `gestion_stock`.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["gestion_stock"],
  });
  if (error) return error;

  const parsed = stockAjustementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const res =
      "lignes" in parsed.data
        ? await ajustementsStock(user!, parsed.data)
        : await ajusterStock(user!, parsed.data);
    return NextResponse.json(res, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || "Erreur", code: e.code },
      { status: e.status || 500 }
    );
  }
}
