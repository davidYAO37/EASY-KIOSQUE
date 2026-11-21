import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { User } from "@/models/users.model";
import { db } from "@/db/mongoConnect";
import {
  getUserPermissions,
  hasActionPermission,
  matchesAllowedRoles,
  type ResolvedPermissions,
} from "@/lib/permissions";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("❌ JWT_SECRET (ou NEXTAUTH_SECRET) doit être défini dans les variables d'environnement");
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const TOKEN_NAME = "ek_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7;

// En production derrière HTTP simple (ex. install locale sur le LAN via
// http://192.168.x.x:3002), un cookie Secure est refusé par le navigateur et
// la session ne persiste jamais. COOKIE_SECURE=false permet de le désactiver
// explicitement ; par défaut on garde secure=true en production.
function isSecureCookie(): boolean {
  const override = process.env.COOKIE_SECURE;
  if (override !== undefined && override !== "") {
    return override === "true";
  }
  return process.env.NODE_ENV === "production";
}

export interface JWTPayload {
  userId: string;
  email: string;
  type: string;
  /** Entreprise du compte (null pour le super-admin plateforme). */
  entrepriseId?: string | null;
  /** Incrémenté au changement de mot de passe : révoque les anciens jetons. */
  tv?: number;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_NAME)?.value;
}

export interface CurrentUser {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  type: string;
  uid: string;
  telephone?: string | null;
  /** Entreprise propriétaire du compte (null = super-admin plateforme). */
  entrepriseId: string | null;
  /** Kiosques auxquels l'utilisateur est affecté (vide = tous). */
  kiosqueIds: string[];
  permissions: ResolvedPermissions;
}

export async function getCurrentUser(req?: NextRequest): Promise<CurrentUser | null> {
  const token = req?.cookies?.get(TOKEN_NAME)?.value || (await getTokenFromCookies());
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  await db();
  const user = await User.findById(payload.userId).lean();

  if (!user) return null;
  if (user.comptebloque) return null;
  // Jeton émis avant un changement de mot de passe → invalide
  if ((payload.tv || 0) !== (user.tokenVersion || 0)) return null;

  return {
    _id: user._id.toString(),
    nom: user.nom || user.name || "",
    prenom: user.prenom || "",
    email: user.email,
    type: user.type || "caissier",
    uid: user.uid || "",
    telephone: user.telephone || null,
    entrepriseId: user.entrepriseId ? user.entrepriseId.toString() : null,
    kiosqueIds: (user.kiosqueIds || []).map((k: any) => k.toString()),
    permissions: getUserPermissions(user),
  };
}

export interface RequireAuthOptions {
  /**
   * Actions requises : l'utilisateur doit posséder TOUTES ces actions.
   * Peut servir d'alternative au rôle : un utilisateur dont le type n'est
   * pas dans allowedRoles mais qui possède les actions requises passe.
   */
  actions?: string[];
  /**
   * Routes de la plateforme (super-admin) : ne pas exiger d'entreprise
   * ni vérifier la suspension d'une entreprise.
   */
  plateforme?: boolean;
}

export async function requireAuth(
  req: NextRequest,
  allowedRoles?: string[],
  options?: RequireAuthOptions
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return { error: NextResponse.json({ message: "Non authentifié" }, { status: 401 }), user: null };
  }

  // Isolation multi-tenant : un compte rattaché à une entreprise suspendue
  // perd l'accès à toutes les API métier. Les routes plateforme passent
  // `plateforme: true` (super-admin sans entreprise).
  if (!options?.plateforme) {
    if (!user.entrepriseId) {
      return {
        error: NextResponse.json(
          { message: "Compte non rattaché à une entreprise", code: "TENANT_REQUIS" },
          { status: 403 }
        ),
        user: null,
      };
    }
    const { Entreprise } = await import("@/models/entreprise");
    const ent = await Entreprise.findById(user.entrepriseId);
    if (!ent || ent.statut === "suspendu") {
      return {
        error: NextResponse.json(
          {
            message: "Compte entreprise suspendu. Contactez la plateforme EASY-KIOSQUE.",
            code: "ENTREPRISE_SUSPENDUE",
          },
          { status: 402 }
        ),
        user: null,
      };
    }

    // Abonnement : au-delà de la période de grâce, l'accès aux API
    // métier est bloqué jusqu'au renouvellement (code 402 distinct).
    const { etatAbonnement } = await import("@/lib/abonnement");
    const etat = await etatAbonnement(ent);
    if (etat.statut === "expire") {
      return {
        error: NextResponse.json(
          {
            message:
              "Abonnement expiré. Renouvelez votre abonnement ou contactez la plateforme EASY-KIOSQUE.",
            code: "ABONNEMENT_EXPIRE",
          },
          { status: 402 }
        ),
        user: null,
      };
    }
  }

  // Routes plateforme : rôles STRICTS — un admin d'entreprise ne doit
  // jamais passer sur une route réservée au super-admin.
  const roleAllowed = options?.plateforme
    ? !allowedRoles || allowedRoles.includes(user.type)
    : !allowedRoles ||
      allowedRoles.includes(user.type) ||
      user.type === "admin" ||
      user.type === "adminsuper" ||
      // Repli : services personnalisés couvrant les services des rôles demandés
      matchesAllowedRoles(user, allowedRoles);

  const hasRequiredActions =
    !!options?.actions?.length &&
    options.actions.every((action) => hasActionPermission(user, action));
  const actionsOk = !options?.actions?.length || hasRequiredActions;

  // Accès si : rôle OK + actions requises OK, ou bien rôle KO mais toutes les
  // actions requises sont accordées (accès alternatif par permission).
  if (!actionsOk || (!roleAllowed && !hasRequiredActions)) {
    return { error: NextResponse.json({ message: "Accès interdit" }, { status: 403 }), user: null };
  }

  return { user, error: null };
}

export async function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(TOKEN_NAME, token, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
}

export async function removeAuthCookie(response: NextResponse) {
  response.cookies.set(TOKEN_NAME, "", {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}
