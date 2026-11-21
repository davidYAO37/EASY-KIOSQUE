import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { remiseAnnulationSchema } from "@/lib/validations";
import { annulerRemise } from "@/services/caisses.service";

/**
 * Annulation d'une remise en attente — action `confirmer_remise`,
 * motif obligatoire ; la remise déclarée est conservée (audit).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["confirmer_remise"],
  });
  if (error) return error;

  const parsed = remiseAnnulationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Motif requis", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const { id } = await params;
  try {
    const remise = await annulerRemise(user!, id, parsed.data.motif);
    return NextResponse.json({ remise });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
