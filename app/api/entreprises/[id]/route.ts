import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Entreprise } from "@/models/entreprise";
import { Kiosque } from "@/models/kiosque";
import { User } from "@/models/users.model";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Plateforme uniquement (super-admin) : détail et pilotage d'un tenant.
 * Aucun accès aux données métier de l'entreprise — fiche + compteurs.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const ent = await Entreprise.findById(id).lean();
  if (!ent) {
    return NextResponse.json({ message: "Entreprise introuvable" }, { status: 404 });
  }

  const { etatAbonnement } = await import("@/lib/abonnement");
  const { JournalConnexion } = await import("@/models/journalConnexion");
  const { PaiementAbonnement } = await import("@/models/paiementAbonnement");

  const entDoc = await Entreprise.findById(id);
  const [nbKiosques, nbUtilisateurs, abo, derniereConnexion, paiements] = await Promise.all([
    Kiosque.countDocuments({ entrepriseId: ent._id }),
    User.countDocuments({ entrepriseId: ent._id }),
    entDoc ? etatAbonnement(entDoc) : null,
    JournalConnexion.findOne({ entrepriseId: ent._id, statut: "success" })
      .sort({ createdAt: -1 })
      .select("createdAt email")
      .lean(),
    PaiementAbonnement.find({ entrepriseId: ent._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return NextResponse.json({
    entreprise: {
      ...ent,
      _id: ent._id.toString(),
      nbKiosques,
      nbUtilisateurs,
      abonnement: abo
        ? {
            planCode: abo.planCode,
            planNom: abo.planNom,
            statut: abo.statut,
            expireLe: abo.expireLe,
            joursRestants: abo.joursRestants,
          }
        : null,
      derniereActivite: derniereConnexion?.createdAt || null,
      paiements,
    },
  });
}

/** Active ou suspend un compte entreprise. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const body = await req.json();
  const statut = body?.statut;
  if (statut !== "actif" && statut !== "suspendu") {
    return NextResponse.json(
      { message: "Statut invalide (actif | suspendu)" },
      { status: 400 }
    );
  }

  await db();
  const ent = await Entreprise.findByIdAndUpdate(
    id,
    { $set: { statut } },
    { new: true }
  ).lean();
  if (!ent) {
    return NextResponse.json({ message: "Entreprise introuvable" }, { status: 404 });
  }
  return NextResponse.json({ entreprise: { ...ent, _id: ent._id.toString() } });
}
