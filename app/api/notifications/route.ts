import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import {
  listerNotifications,
  peutVoirNotifications,
} from "@/services/notifications.service";

/**
 * Centre de notifications — réservé au propriétaire et à ses gestionnaires.
 * Retourne les notifications récentes + le compteur de non lues.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  if (!peutVoirNotifications(user!)) {
    return NextResponse.json({ message: "Accès interdit" }, { status: 403 });
  }

  await db();
  const sp = req.nextUrl.searchParams;
  const res = await listerNotifications(user!, {
    kiosqueId: sp.get("kiosqueId") || undefined,
    lues: (sp.get("lues") as "0" | "1") || undefined,
    du: sp.get("du") || undefined,
    au: sp.get("au") || undefined,
    limit: Number(sp.get("limit")) || 50,
  });
  return NextResponse.json(res);
}
