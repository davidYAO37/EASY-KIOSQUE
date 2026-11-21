import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { TokenReset } from "@/models/tokenReset";
import { resetDemandeSchema } from "@/lib/validations";
import { envoyerMail, gabaritMail, mailConfigure } from "@/lib/mail";

// Limitation anti-abus : 5 demandes par heure et par IP.
const demandesParIp = new Map<string, { count: number; reset: number }>();
const LIMITE = 5;
const FENETRE_MS = 60 * 60 * 1000;

const REPONSE_NEUTRE = {
  message:
    "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé. Vérifiez votre boîte de réception (et les spams).",
};

function ipDe(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * Demande de réinitialisation de mot de passe.
 * Réponse volontairement IDENTIQUE que l'email existe ou non — pour ne
 * pas révéler quels comptes existent (énumération).
 */
export async function POST(req: NextRequest) {
  const ip = ipDe(req);
  const maintenant = Date.now();
  const compteur = demandesParIp.get(ip);
  if (compteur && maintenant < compteur.reset && compteur.count >= LIMITE) {
    return NextResponse.json(
      { message: "Trop de demandes. Réessayez dans une heure." },
      { status: 429 }
    );
  }
  demandesParIp.set(ip, {
    count: (compteur && maintenant < compteur.reset ? compteur.count : 0) + 1,
    reset: compteur && maintenant < compteur.reset ? compteur.reset : maintenant + FENETRE_MS,
  });

  const body = await req.json().catch(() => null);
  const parsed = resetDemandeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(REPONSE_NEUTRE);
  }

  await db();
  const user = await User.findOne({ email: parsed.data.email });
  if (!user) {
    return NextResponse.json(REPONSE_NEUTRE);
  }

  // Invalide les jetons précédents non utilisés puis en émet un nouveau
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await TokenReset.updateMany(
    { userId: user._id, utiliseLe: null },
    { $set: { utiliseLe: new Date() } }
  );
  await TokenReset.create({
    userId: user._id,
    email: user.email,
    tokenHash,
    expireLe: new Date(maintenant + 60 * 60 * 1000),
  });

  const base = process.env.NEXT_PUBLIC_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const url = `${base}/reinitialiser?token=${token}`;
  const res = await envoyerMail({
    to: user.email,
    subject: "Réinitialisation de votre mot de passe EASY-KIOSQUE",
    html: gabaritMail(
      "Mot de passe oublié",
      `Bonjour ${user.prenom || ""} ${user.nom || ""},<br/><br/>
       Vous avez demandé la réinitialisation de votre mot de passe.
       Ce lien est valable <b>1 heure</b> et utilisable une seule fois.<br/><br/>
       Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email —
       votre mot de passe actuel reste inchangé.`,
      { url, libelle: "Réinitialiser mon mot de passe" }
    ),
  });

  return NextResponse.json({
    ...REPONSE_NEUTRE,
    ...(mailConfigure() ? {} : { dev: res.envoye === false ? "SMTP non configuré — lien visible dans les logs serveur" : undefined }),
  });
}
