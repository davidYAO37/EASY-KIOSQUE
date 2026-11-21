import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { detailCreance } from "@/services/credits.service";

type Ctx = { params: Promise<{ id: string }> };

/** Détail d'une créance + historique des versements rattachés. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_credits"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const detail = await detailCreance(user!, id);
  if (!detail) {
    return NextResponse.json({ message: "Créance introuvable" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
