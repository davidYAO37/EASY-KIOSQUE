import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import {
  marquerLue,
  peutVoirNotifications,
} from "@/services/notifications.service";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH : marque une notification comme lue par l'utilisateur courant. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;
  if (!peutVoirNotifications(user!)) {
    return NextResponse.json({ message: "Accès interdit" }, { status: 403 });
  }

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const notif = await marquerLue(user!, id);
  if (!notif) {
    return NextResponse.json(
      { message: "Notification introuvable" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
