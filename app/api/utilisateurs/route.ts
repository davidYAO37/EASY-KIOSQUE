import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { Profil } from "@/models/profil";
import { Kiosque } from "@/models/kiosque";
import { hashPassword, generateLocalUID } from "@/utils/auth";
import {
  ALL_ACTION_CODES,
  ALL_SERVICE_CODES,
  ROLE_LABELS,
  lireDroitsProfil,
} from "@/lib/permissions";
import { utilisateurCreateSchema } from "@/lib/validations";

const AUTORISES = ["admin", "gestionnaire"];

/** Utilisateurs de l'entreprise (sans mot de passe). */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  await db();
  const utilisateurs = await User.find({ entrepriseId: user!.entrepriseId })
    .select("-password")
    .populate("kiosqueIds", "code designation")
    .populate("profilId", "profil")
    .sort({ nom: 1 })
    .lean();

  return NextResponse.json({
    utilisateurs: utilisateurs.map((u) => ({ ...u, _id: u._id.toString() })),
  });
}

/** Vérifie que les kiosques cités appartiennent bien à l'entreprise. */
async function kiosquesValides(entrepriseId: string, ids: string[]) {
  const valides = ids.filter((id) => Types.ObjectId.isValid(id));
  const count = await Kiosque.countDocuments({
    _id: { $in: valides.map((id) => new Types.ObjectId(id)) },
    entrepriseId: new Types.ObjectId(entrepriseId),
  });
  return count === valides.length ? valides : null;
}

export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const parsed = utilisateurCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Rôle : jamais adminsuper ; seul un vrai admin crée un compte admin —
  // un délégué « gestion_utilisateurs » ne peut pas s'auto-promouvoir.
  let type = data.type || "caissier";
  if (type === "adminsuper" || !ROLE_LABELS[type]) type = "caissier";
  if (type === "admin" && user!.type !== "admin" && user!.type !== "adminsuper") {
    type = "caissier";
  }

  await db();

  // Limite du plan d'abonnement (ex. ESSAI = 3 utilisateurs)
  const { verifierLimitePlan } = await import("@/lib/abonnement");
  const limite = await verifierLimitePlan(user!.entrepriseId!, "utilisateur");
  if (limite) {
    return NextResponse.json({ message: limite, code: "LIMITE_PLAN" }, { status: 403 });
  }

  const email = data.email.toLowerCase().trim();
  const existe = await User.findOne({ email }).select("_id").lean();
  if (existe) {
    return NextResponse.json(
      { message: "Cet identifiant est déjà utilisé." },
      { status: 409 }
    );
  }

  // Kiosques : seuls ceux de l'entreprise sont acceptés
  let kiosqueIds: string[] = [];
  if (data.kiosqueIds?.length) {
    const valides = await kiosquesValides(user!.entrepriseId!, data.kiosqueIds);
    if (!valides) {
      return NextResponse.json(
        { message: "Un ou plusieurs kiosques sont invalides." },
        { status: 400 }
      );
    }
    kiosqueIds = valides;
  }

  // Profil : impose rôle + permissions (modèle de droits)
  let profilId: Types.ObjectId | null = null;
  let permissions: any = undefined;
  if (data.profilId && Types.ObjectId.isValid(data.profilId)) {
    const profil = await Profil.findOne({
      _id: new Types.ObjectId(data.profilId),
      entrepriseId: user!.entrepriseId,
    }).lean();
    if (profil) {
      profilId = profil._id as Types.ObjectId;
      type = profil.type || type;
      if (profil.customized) {
        permissions = {
          customized: true,
          services: profil.services || [],
          actions: profil.actions || [],
        };
      }
    }
  }

  // Permissions personnalisées directes (si pas de profil custom)
  if (!permissions && data.permissions?.customized) {
    permissions = {
      customized: true,
      services: (data.permissions.services || []).filter((s) =>
        (ALL_SERVICE_CODES as string[]).includes(s)
      ),
      actions: (data.permissions.actions || []).filter((a) =>
        ALL_ACTION_CODES.includes(a)
      ),
    };
  }

  const cree = await User.create({
    nom: data.nom,
    prenom: data.prenom || undefined,
    name: `${data.nom} ${data.prenom || ""}`.trim(),
    email,
    password: await hashPassword(data.password),
    type,
    entrepriseId: new Types.ObjectId(user!.entrepriseId!),
    kiosqueIds: kiosqueIds.map((id) => new Types.ObjectId(id)),
    profilId,
    comptebloque: !!data.comptebloque,
    permissions,
    uid: generateLocalUID(),
  });

  const { password: _pw, ...sansMotDePasse } = cree.toObject();
  return NextResponse.json(
    { utilisateur: { ...sansMotDePasse, _id: cree._id.toString() } },
    { status: 201 }
  );
}
