import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { rapportDepenses } from "@/services/rapports.service";

/** Rapport des dépenses — `consulter_rapports`. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_rapports"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const rapport = await rapportDepenses(user!, {
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    kiosqueId: sp.get("kiosqueId") || undefined,
  });
  return NextResponse.json(rapport);
}
