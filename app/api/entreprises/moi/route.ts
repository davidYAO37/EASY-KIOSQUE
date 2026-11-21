import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Entreprise } from "@/models/entreprise";
import { entrepriseUpdateSchema } from "@/lib/validations";

/** Fiche de l'entreprise du compte connecté (tenant courant). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const ent = await Entreprise.findById(user!.entrepriseId).lean();
  if (!ent) {
    return NextResponse.json({ message: "Entreprise introuvable" }, { status: 404 });
  }
  return NextResponse.json({ entreprise: { ...ent, _id: ent._id.toString() } });
}

/**
 * Mise à jour de la fiche entreprise — liste blanche stricte :
 * jamais `statut` ni les champs d'abonnement (réservés à la plateforme).
 */
export async function PUT(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["parametrage_general"],
  });
  if (error) return error;

  const parsed = entrepriseUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  const ent = await Entreprise.findOneAndUpdate(
    { _id: user!.entrepriseId },
    { $set: parsed.data },
    { new: true }
  ).lean();
  if (!ent) {
    return NextResponse.json({ message: "Entreprise introuvable" }, { status: 404 });
  }
  return NextResponse.json({ entreprise: { ...ent, _id: ent._id.toString() } });
}
