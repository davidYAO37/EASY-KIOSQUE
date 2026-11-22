import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { z } from "zod";
import { traiterDemande } from "@/services/demandesAnnulation.service";

type Ctx = { params: Promise<{ id: string }> };

const decisionSchema = z
  .object({
    decision: z.enum(["valider", "rejeter"]),
    motifRejet: z.string().max(500).optional(),
  })
  .strict();

/**
 * Validation / rejet d'une demande d'annulation — action `annuler_vente`
 * obligatoire (jamais le vendeur). La validation exécute l'annulation
 * réelle : vente conservée, compensations caisse et journal tracés.
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

  const parsed = decisionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides" }, { status: 400 });
  }

  await db();
  try {
    const demande = await traiterDemande(
      user!,
      id,
      parsed.data.decision,
      parsed.data.motifRejet
    );
    return NextResponse.json({ demande });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
