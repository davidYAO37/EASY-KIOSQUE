import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { TokenReset } from "@/models/tokenReset";
import { resetConfirmeSchema } from "@/lib/validations";
import { hashPassword } from "@/utils/auth";
import { JournalActivite } from "@/models/journalActivite";

const REPONSE_INVALIDE = {
  message: "Ce lien de réinitialisation est invalide ou a expiré. Refaites une demande.",
};

/**
 * Réinitialisation effective : jeton (hash SHA-256 stocké, usage unique,
 * 1 h de validité) + nouveau mot de passe. Toutes les sessions du compte
 * sont révoquées via tokenVersion++.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = resetConfirmeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(REPONSE_INVALIDE, { status: 400 });
  }

  await db();
  const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
  const jeton = await TokenReset.findOne({ tokenHash });
  if (!jeton || jeton.utiliseLe || jeton.expireLe < new Date()) {
    return NextResponse.json(REPONSE_INVALIDE, { status: 400 });
  }

  const user = await User.findById(jeton.userId);
  if (!user) {
    return NextResponse.json(REPONSE_INVALIDE, { status: 400 });
  }

  user.password = await hashPassword(parsed.data.nouveauMotDePasse);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  user.failedAttempts = 0;
  user.isLocked = false;
  user.lockedUntil = undefined;
  await user.save();
  jeton.utiliseLe = new Date();
  await jeton.save();

  if (user.entrepriseId) {
    await JournalActivite.create({
      entrepriseId: user.entrepriseId,
      userId: user._id,
      action: "reinitialisation_mot_de_passe",
      module: "compte",
      details: { par: "lien_email" },
    }).catch(() => {});
  }

  return NextResponse.json({
    message: "Mot de passe réinitialisé. Vous pouvez vous connecter.",
  });
}
