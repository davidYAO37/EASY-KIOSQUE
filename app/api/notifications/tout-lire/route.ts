import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import {
  peutVoirNotifications,
  toutMarquerLues,
} from "@/services/notifications.service";

/** POST : marque toutes les notifications comme lues par l'utilisateur. */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  if (!peutVoirNotifications(user!)) {
    return NextResponse.json({ message: "Accès interdit" }, { status: 403 });
  }

  await db();
  await toutMarquerLues(user!);
  return NextResponse.json({ ok: true });
}
