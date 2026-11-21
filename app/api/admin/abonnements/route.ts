import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Entreprise } from "@/models/entreprise";
import { Plan } from "@/models/plan";
import { PaiementAbonnement } from "@/models/paiementAbonnement";
import { paiementAbonnementSchema } from "@/lib/validations";

/**
 * Paiements d'abonnement enregistrés par la plateforme (encaissement
 * manuel Wave / OM / MTN / virement). GET = historique complet ;
 * POST = nouvel encaissement → prolonge `abonnementExpireLe` de
 * l'entreprise et change de plan si demandé.
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const filtre: Record<string, any> = {};
  if (sp.get("entrepriseId") && Types.ObjectId.isValid(sp.get("entrepriseId")!)) {
    filtre.entrepriseId = new Types.ObjectId(sp.get("entrepriseId")!);
  }
  const paiements = await PaiementAbonnement.find(filtre)
    .sort({ createdAt: -1 })
    .limit(Number(sp.get("limit")) || 200)
    .populate("entrepriseId", "nomSociete nomCommercial")
    .populate("enregistrePar", "nom prenom")
    .lean();
  return NextResponse.json({ paiements });
}

/** Enregistre un encaissement d'abonnement et prolonge l'entreprise. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["adminsuper"], { plateforme: true });
  if (error) return error;

  const parsed = paiementAbonnementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;
  if (!Types.ObjectId.isValid(d.entrepriseId)) {
    return NextResponse.json({ message: "Entreprise invalide" }, { status: 400 });
  }

  await db();
  const [ent, plan] = await Promise.all([
    Entreprise.findById(d.entrepriseId),
    Plan.findOne({ code: d.planCode }).lean(),
  ]);
  if (!ent) {
    return NextResponse.json({ message: "Entreprise introuvable" }, { status: 404 });
  }
  if (!plan) {
    return NextResponse.json({ message: "Plan introuvable" }, { status: 404 });
  }

  // La nouvelle période part de la fin actuelle si encore valide,
  // sinon d'aujourd'hui — jamais de temps d'abonnement perdu.
  const maintenant = new Date();
  const debut =
    ent.abonnementExpireLe && ent.abonnementExpireLe > maintenant
      ? ent.abonnementExpireLe
      : maintenant;
  const fin = new Date(debut);
  fin.setMonth(fin.getMonth() + d.mois);

  await PaiementAbonnement.create({
    entrepriseId: ent._id,
    planCode: plan.code,
    montant: d.montant,
    periodeDebut: debut,
    periodeFin: fin,
    modePaiement: d.modePaiement,
    reference: d.reference || undefined,
    note: d.note || undefined,
    enregistrePar: user!._id,
  });

  ent.abonnementPlan = plan.code;
  ent.abonnementExpireLe = fin;
  await ent.save();

  return NextResponse.json({
    message: `Abonnement ${plan.nom} prolongé jusqu'au ${fin.toLocaleDateString("fr-FR")}`,
    expireLe: fin,
  }, { status: 201 });
}
