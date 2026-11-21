import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Profil } from "@/models/profil";
import { lireDroitsProfil } from "@/lib/permissions";
import { profilSchema } from "@/lib/validations";

const AUTORISES = ["admin", "gestionnaire"];

/** Profils de droits de l'entreprise. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  await db();
  const profils = await Profil.find({ entrepriseId: user!.entrepriseId })
    .sort({ profil: 1 })
    .lean();
  return NextResponse.json({
    profils: profils.map((p) => ({ ...p, _id: p._id.toString() })),
  });
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const parsed = profilSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const entrepriseId = new Types.ObjectId(user!.entrepriseId!);
  const nom = parsed.data.profil.trim();

  const doublon = await Profil.findOne({ entrepriseId, profil: nom })
    .select("_id")
    .lean();
  if (doublon) {
    return NextResponse.json(
      { message: "Un profil porte déjà ce nom." },
      { status: 409 }
    );
  }

  const droits = lireDroitsProfil(parsed.data);
  const profil = await Profil.create({
    entrepriseId,
    profil: nom,
    type: droits.type,
    customized: droits.customized,
    services: droits.services,
    actions: droits.actions,
  });

  return NextResponse.json(
    { profil: { ...profil.toObject(), _id: profil._id.toString() } },
    { status: 201 }
  );
}
