import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { ouvertureCaisseSchema } from "@/lib/validations";
import { ouvrirCaisse } from "@/services/caisses.service";

/** Ouverture de caisse — action `ouvrir_caisse` (vendeur inclus). */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["ouvrir_caisse"],
  });
  if (error) return error;

  const parsed = ouvertureCaisseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const session = await ouvrirCaisse(user!, parsed.data);
    return NextResponse.json({ session }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
