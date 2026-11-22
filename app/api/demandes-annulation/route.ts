import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { listerDemandes, listerDemandeurs } from "@/services/demandesAnnulation.service";

/**
 * Demandes d'annulation — historisées par demandeur/période.
 * Validateurs et admins : tout le tenant (filtres demandeurId, statut,
 * kiosqueId, du/au) ; opérateurs : leurs propres demandes.
 * `?demandeurs=1` → liste distincte des demandeurs (filtre UI).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  if (sp.get("demandeurs") === "1") {
    return NextResponse.json({ demandeurs: await listerDemandeurs(user!) });
  }
  const liste = await listerDemandes(user!, {
    statut: sp.get("statut") || undefined,
    demandeurId: sp.get("demandeurId") || undefined,
    kiosqueId: sp.get("kiosqueId") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}
