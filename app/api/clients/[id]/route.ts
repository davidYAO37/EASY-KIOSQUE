import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { clientSchema } from "@/lib/validations";
import {
  desactiverClient,
  detailClient,
  majClient,
} from "@/services/clients.service";

type Ctx = { params: Promise<{ id: string }> };
const GESTIONNAIRES = ["admin", "gestionnaire", "comptable"];

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const client = await detailClient(user!.entrepriseId!, id);
  if (!client) {
    return NextResponse.json({ message: "Client introuvable" }, { status: 404 });
  }
  return NextResponse.json({ client });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, GESTIONNAIRES);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = clientSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const client = await majClient(user!.entrepriseId!, id, parsed.data);
    if (!client) {
      return NextResponse.json({ message: "Client introuvable" }, { status: 404 });
    }
    return NextResponse.json({ client });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}

/** Soft-delete : le client est désactivé, l'historique est conservé. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, GESTIONNAIRES);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const client = await desactiverClient(user!.entrepriseId!, id);
  if (!client) {
    return NextResponse.json({ message: "Client introuvable" }, { status: 404 });
  }
  return NextResponse.json({ message: "Client désactivé" });
}
