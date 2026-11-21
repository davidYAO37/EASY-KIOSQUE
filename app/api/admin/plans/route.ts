import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Plan } from "@/models/plan";
import { planSchema } from "@/lib/validations";

/** Liste les plans d'abonnement (super-admin). */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  await db();
  const plans = await Plan.find().sort({ prixMensuel: 1 }).lean();
  return NextResponse.json({ plans });
}

/** Crée un plan d'abonnement (super-admin). */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  const parsed = planSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const existe = await Plan.findOne({ code: parsed.data.code }).select("_id").lean();
  if (existe) {
    return NextResponse.json({ message: "Ce code plan existe déjà" }, { status: 409 });
  }
  const plan = await Plan.create(parsed.data);
  return NextResponse.json({ plan }, { status: 201 });
}
