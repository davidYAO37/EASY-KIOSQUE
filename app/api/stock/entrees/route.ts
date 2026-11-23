import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { stockEntreeSchema } from "@/lib/validations";
import { entreeStock, entreesStock } from "@/services/stock.service";

/** Entrée de stock (approvisionnement) — action `gestion_stock`. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["gestion_stock"],
  });
  if (error) return error;

  const parsed = stockEntreeSchema.safeParse(await req.json());
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
        ? await entreesStock(user!, parsed.data)
        : await entreeStock(user!, parsed.data);
    return NextResponse.json(res, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e.message || "Erreur", code: e.code },
      { status: e.status || 500 }
    );
  }
}
