import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { remboursementSchema } from "@/lib/validations";
import {
  enregistrerRemboursement,
  listerRemboursements,
} from "@/services/credits.service";

/** Historique des remboursements (filtres client / kiosque / période). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_credits"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const liste = await listerRemboursements(user!, {
    clientId: sp.get("clientId") || undefined,
    kiosqueId: sp.get("kiosqueId") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}

/**
 * Encaissement d'un remboursement — action `enregistrer_remboursement`.
 * Montant jamais supérieur au solde restant ; ventilation explicite
 * ou automatique (créance la plus ancienne d'abord) ; transaction.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["enregistrer_remboursement"],
  });
  if (error) return error;

  const parsed = remboursementSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const { remboursement, dupliquee } = await enregistrerRemboursement(
      user!,
      parsed.data
    );
    return NextResponse.json({ remboursement, dupliquee }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur", code: e?.code },
      { status: e?.status || 500 }
    );
  }
}
