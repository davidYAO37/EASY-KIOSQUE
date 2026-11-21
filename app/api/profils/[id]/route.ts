import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Profil } from "@/models/profil";
import { User } from "@/models/users.model";
import { lireDroitsProfil } from "@/lib/permissions";
import { profilSchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };
const AUTORISES = ["admin", "gestionnaire"];

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = profilSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const filtre = {
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user!.entrepriseId!),
  };

  if (parsed.data.profil) {
    const doublon = await Profil.findOne({
      entrepriseId: user!.entrepriseId,
      profil: parsed.data.profil.trim(),
      _id: { $ne: new Types.ObjectId(id) },
    }).select("_id").lean();
    if (doublon) {
      return NextResponse.json(
        { message: "Un profil porte déjà ce nom." },
        { status: 409 }
      );
    }
  }

  const droits = lireDroitsProfil(parsed.data);
  const data: any = { ...droits };
  if (parsed.data.profil) data.profil = parsed.data.profil.trim();

  const profil = await Profil.findOneAndUpdate(filtre, { $set: data }, { new: true }).lean();
  if (!profil) {
    return NextResponse.json({ message: "Profil introuvable" }, { status: 404 });
  }
  return NextResponse.json({ profil: { ...profil, _id: profil._id.toString() } });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const filtre = {
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user!.entrepriseId!),
  };

  const enUsage = await User.countDocuments({
    entrepriseId: user!.entrepriseId,
    profilId: new Types.ObjectId(id),
  });
  if (enUsage > 0) {
    return NextResponse.json(
      { message: `Ce profil est attribué à ${enUsage} utilisateur(s).` },
      { status: 409 }
    );
  }

  const res = await Profil.deleteOne(filtre);
  if (!res.deletedCount) {
    return NextResponse.json({ message: "Profil introuvable" }, { status: 404 });
  }
  return NextResponse.json({ message: "Profil supprimé" });
}
