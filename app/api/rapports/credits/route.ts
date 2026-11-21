import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { rapportCredits } from "@/services/rapports.service";

/** Rapport des créances (soldes dus par client/kiosque) — `consulter_rapports`. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_rapports"],
  });
  if (error) return error;

  await db();
  const rapport = await rapportCredits(user!, {
    kiosqueId: req.nextUrl.searchParams.get("kiosqueId") || undefined,
  });
  return NextResponse.json(rapport);
}
