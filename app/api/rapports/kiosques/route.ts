import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { comparaisonKiosques } from "@/services/rapports.service";

/** Comparaison des performances entre kiosques — `consulter_rapports`. */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, undefined, {
    actions: ["consulter_rapports"],
  });
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  const rapport = await comparaisonKiosques(user!, {
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
  });
  return NextResponse.json(rapport);
}
