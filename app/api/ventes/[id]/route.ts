import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { detailVente } from "@/services/ventes.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Détail d'une vente (lignes + paiements). La portée vendeur → ses ventes
 * uniquement est appliquée dans le service.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const vente = await detailVente(user!, id);
  if (!vente) {
    return NextResponse.json({ message: "Vente introuvable" }, { status: 404 });
  }
  return NextResponse.json({ vente });
}
