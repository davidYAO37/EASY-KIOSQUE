import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { venteAnnulationSchema } from "@/lib/validations";
import { annulerVente } from "@/services/ventes.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Annulation d'une vente validée — réservée aux profils autorisés
 * (action `annuler_vente` : propriétaire/gestionnaire, JAMAIS le vendeur).
 * Motif obligatoire ; la vente est conservée et la correction tracée.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["annuler_vente"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = venteAnnulationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Un motif d'annulation (3 caractères min.) est obligatoire." },
      { status: 400 }
    );
  }

  await db();
  try {
    const vente = await annulerVente(user!, id, parsed.data.motif);
    return NextResponse.json({ vente });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
