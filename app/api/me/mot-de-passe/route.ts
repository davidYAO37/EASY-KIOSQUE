import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, signToken, setAuthCookie } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { changementMdpSchema } from "@/lib/validations";
import { hashPassword, verifyPassword } from "@/utils/auth";
import { JournalActivite } from "@/models/journalActivite";

/**
 * Changement de son propre mot de passe : ancien mot de passe requis.
 * tokenVersion++ révoque TOUS les autres appareils/sessions ; un jeton
 * frais est réémis pour garder la session courante active.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = changementMdpSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides", erreurs: parsed.error.issues }, { status: 400 });
  }

  await db();
  const doc = await User.findById(user._id);
  if (!doc) {
    return NextResponse.json({ message: "Compte introuvable" }, { status: 404 });
  }

  const ok = await verifyPassword(parsed.data.ancienMotDePasse, doc.password || "");
  if (!ok) {
    return NextResponse.json({ message: "Ancien mot de passe incorrect" }, { status: 400 });
  }
  if (parsed.data.nouveauMotDePasse === parsed.data.ancienMotDePasse) {
    return NextResponse.json({ message: "Le nouveau mot de passe doit être différent" }, { status: 400 });
  }

  doc.password = await hashPassword(parsed.data.nouveauMotDePasse);
  doc.tokenVersion = (doc.tokenVersion || 0) + 1;
  doc.failedAttempts = 0;
  doc.isLocked = false;
  doc.lockedUntil = undefined;
  await doc.save();

  if (doc.entrepriseId) {
    await JournalActivite.create({
      entrepriseId: doc.entrepriseId,
      userId: doc._id,
      action: "changement_mot_de_passe",
      module: "compte",
      details: { par: "utilisateur" },
    }).catch(() => {});
  }

  // Réémission d'un jeton avec la nouvelle tv → la session courante
  // reste valide, toutes les autres sont révoquées.
  const response = NextResponse.json({ message: "Mot de passe modifié" });
  const token = signToken({
    userId: doc._id.toString(),
    email: doc.email,
    type: doc.type || "caissier",
    entrepriseId: doc.entrepriseId ? doc.entrepriseId.toString() : null,
    tv: doc.tokenVersion,
  });
  await setAuthCookie(response, token);
  return response;
}
