import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { confirmerRemise } from "@/services/caisses.service";

/**
 * Confirmation d'une remise — action `confirmer_remise` (jamais vendeur).
 * La sortie de caisse n'est comptabilisée qu'à cette étape.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["confirmer_remise"],
  });
  if (error) return error;

  await db();
  const { id } = await params;
  try {
    const remise = await confirmerRemise(user!, id);
    return NextResponse.json({ remise });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
