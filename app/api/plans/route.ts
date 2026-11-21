import { NextResponse } from "next/server";
import { db } from "@/db/mongoConnect";
import { Plan } from "@/models/plan";

/**
 * GET /api/plans — PUBLIC (page d'accueil, aucune session requise).
 * Retourne les plans d'abonnement actifs saisis par le super-admin,
 * triés par prix : la vitrine affiche toujours les tarifs réels.
 */
export async function GET() {
  await db();
  const plans = await Plan.find({ statut: "actif" })
    .sort({ prixMensuel: 1, createdAt: 1 })
    .select("code nom prixMensuel dureeEssaiJours maxKiosques maxUtilisateurs description vedette")
    .lean();
  return NextResponse.json({ plans });
}
