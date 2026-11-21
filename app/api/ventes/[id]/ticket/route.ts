import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { donneesTicket } from "@/services/ventes.service";

type Ctx = { params: Promise<{ id: string }> };

/** Données du ticket imprimable (en-tête entreprise + contenu de la vente). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const ticket = await donneesTicket(user!, id);
  if (!ticket) {
    return NextResponse.json({ message: "Vente introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ticket });
}
