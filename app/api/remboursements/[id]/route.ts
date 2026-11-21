import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { detailRemboursement } from "@/services/credits.service";

type Ctx = { params: Promise<{ id: string }> };

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
  const rmb = await detailRemboursement(user!, id);
  if (!rmb) {
    return NextResponse.json({ message: "Remboursement introuvable" }, { status: 404 });
  }
  return NextResponse.json({ remboursement: rmb });
}
