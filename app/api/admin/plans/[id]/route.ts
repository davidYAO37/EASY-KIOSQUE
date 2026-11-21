import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Plan } from "@/models/plan";
import { planSchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };

/** Met à jour un plan d'abonnement (super-admin). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = planSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }
  delete (parsed.data as any).code; // le code reste immuable

  await db();
  const plan = await Plan.findByIdAndUpdate(id, { $set: parsed.data }, { new: true });
  if (!plan) {
    return NextResponse.json({ message: "Plan introuvable" }, { status: 404 });
  }
  return NextResponse.json({ plan });
}
