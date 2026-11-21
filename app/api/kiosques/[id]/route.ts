import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Kiosque } from "@/models/kiosque";
import { JournalActivite } from "@/models/journalActivite";
import { kiosqueSchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };

function filtreKiosque(user: any, id: string) {
  return {
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user.entrepriseId),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const kiosque = await Kiosque.findOne(filtreKiosque(user, id)).lean();
  if (!kiosque) {
    return NextResponse.json({ message: "Kiosque introuvable" }, { status: 404 });
  }
  return NextResponse.json({ kiosque: { ...kiosque, _id: kiosque._id.toString() } });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["gerer_kiosques"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = kiosqueSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const data: any = { ...parsed.data };
  if (data.code) data.code = data.code.toUpperCase().trim();

  // Unicité du code dans l'entreprise
  if (data.code) {
    const doublon = await Kiosque.findOne({
      entrepriseId: new Types.ObjectId(user!.entrepriseId!),
      code: data.code,
      _id: { $ne: new Types.ObjectId(id) },
    }).select("_id").lean();
    if (doublon) {
      return NextResponse.json(
        { message: `Le code kiosque « ${data.code} » existe déjà.` },
        { status: 409 }
      );
    }
  }

  const kiosque = await Kiosque.findOneAndUpdate(
    filtreKiosque(user, id),
    { $set: data },
    { new: true }
  ).lean();
  if (!kiosque) {
    return NextResponse.json({ message: "Kiosque introuvable" }, { status: 404 });
  }
  return NextResponse.json({ kiosque: { ...kiosque, _id: kiosque._id.toString() } });
}

/**
 * Suppression contrôlée : le kiosque est désactivé (soft-delete) pour
 * préserver l'historique des ventes et caisses qui y sont rattachées.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, ["admin"], {
    actions: ["gerer_kiosques"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const kiosque = await Kiosque.findOneAndUpdate(
    filtreKiosque(user, id),
    { $set: { statut: "inactif" } },
    { new: true }
  ).lean();
  if (!kiosque) {
    return NextResponse.json({ message: "Kiosque introuvable" }, { status: 404 });
  }

  await JournalActivite.create({
    entrepriseId: new Types.ObjectId(user!.entrepriseId!),
    kiosqueId: new Types.ObjectId(id),
    userId: new Types.ObjectId(user!._id),
    action: "desactivation_kiosque",
    module: "kiosques",
    details: { code: kiosque.code, designation: kiosque.designation },
  });

  return NextResponse.json({ message: "Kiosque désactivé" });
}
