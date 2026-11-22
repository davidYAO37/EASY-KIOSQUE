import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { venteAnnulationSchema } from "@/lib/validations";
import { creerDemande } from "@/services/demandesAnnulation.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Demande d'annulation d'une vente — ouverte à tout utilisateur du tenant ;
 * la portée est vérifiée dans le service (vendeur/caissier : leurs ventes
 * uniquement). Motif obligatoire. La décision appartient aux profils
 * disposant de l'action `annuler_vente`.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = venteAnnulationSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Un motif (3 caractères min.) est obligatoire." },
      { status: 400 }
    );
  }

  await db();
  try {
    const demande = await creerDemande(user!, id, parsed.data.motif);
    return NextResponse.json({ demande }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
