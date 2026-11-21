import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { Profil } from "@/models/profil";
import { Kiosque } from "@/models/kiosque";
import { hashPassword } from "@/utils/auth";
import {
  ALL_ACTION_CODES,
  ALL_SERVICE_CODES,
  ROLE_LABELS,
} from "@/lib/permissions";
import { utilisateurUpdateSchema } from "@/lib/validations";

type Ctx = { params: Promise<{ id: string }> };
const AUTORISES = ["admin", "gestionnaire"];

function filtreUser(user: any, id: string) {
  return {
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user.entrepriseId),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const u = await User.findOne(filtreUser(user, id))
    .select("-password")
    .populate("kiosqueIds", "code designation")
    .populate("profilId", "profil")
    .lean();
  if (!u) {
    return NextResponse.json({ message: "Utilisateur introuvable" }, { status: 404 });
  }
  return NextResponse.json({ utilisateur: { ...u, _id: u._id.toString() } });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = utilisateurUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  await db();
  const cible = await User.findOne(filtreUser(user, id));
  if (!cible) {
    return NextResponse.json({ message: "Utilisateur introuvable" }, { status: 404 });
  }

  // Anti auto-modification des attributs sensibles
  const estSoiMeme = String(cible._id) === user!._id;
  const estAdmin = user!.type === "admin" || user!.type === "adminsuper";

  // Liste blanche — entrepriseId, tokenVersion, compteurs de verrouillage
  // et audit ne sont jamais repris du body.
  if (data.nom !== undefined) cible.nom = data.nom;
  if (data.prenom !== undefined) cible.prenom = data.prenom || undefined;
  cible.name = `${cible.nom || ""} ${cible.prenom || ""}`.trim();

  if (data.email !== undefined && data.email.toLowerCase().trim() !== cible.email) {
    const email = data.email.toLowerCase().trim();
    const doublon = await User.findOne({ email, _id: { $ne: cible._id } })
      .select("_id")
      .lean();
    if (doublon) {
      return NextResponse.json(
        { message: "Cet identifiant est déjà utilisé." },
        { status: 409 }
      );
    }
    cible.email = email;
  }

  // Rôle : jamais adminsuper ; seul un vrai admin attribue le rôle admin ;
  // impossible de changer son propre rôle.
  if (data.type !== undefined && !estSoiMeme) {
    let type = data.type;
    if (type === "adminsuper" || !ROLE_LABELS[type]) type = "caissier";
    if (type === "admin" && !estAdmin) type = "caissier";
    cible.type = type;
  }

  if (data.kiosqueIds !== undefined) {
    const ids = (data.kiosqueIds || []).filter((k) => Types.ObjectId.isValid(k));
    const count = await Kiosque.countDocuments({
      _id: { $in: ids.map((k) => new Types.ObjectId(k)) },
      entrepriseId: user!.entrepriseId,
    });
    if (count !== ids.length) {
      return NextResponse.json(
        { message: "Un ou plusieurs kiosques sont invalides." },
        { status: 400 }
      );
    }
    cible.kiosqueIds = ids.map((k) => new Types.ObjectId(k));
  }

  // Profil : impose rôle + permissions
  if (data.profilId !== undefined) {
    if (data.profilId && Types.ObjectId.isValid(data.profilId)) {
      const profil = await Profil.findOne({
        _id: new Types.ObjectId(data.profilId),
        entrepriseId: user!.entrepriseId,
      }).lean();
      if (profil) {
        cible.profilId = profil._id as Types.ObjectId;
        cible.type = profil.type || cible.type;
        cible.permissions = profil.customized
          ? {
              customized: true,
              services: profil.services || [],
              actions: profil.actions || [],
            }
          : { customized: false };
      }
    } else {
      cible.profilId = undefined;
    }
  }

  if (data.permissions !== undefined) {
    cible.permissions = data.permissions.customized
      ? {
          customized: true,
          services: (data.permissions.services || []).filter((s) =>
            (ALL_SERVICE_CODES as string[]).includes(s)
          ),
          actions: (data.permissions.actions || []).filter((a) =>
            ALL_ACTION_CODES.includes(a)
          ),
        }
      : { customized: false };
  }

  // comptebloque : pas sur soi-même
  if (data.comptebloque !== undefined && !estSoiMeme) {
    cible.comptebloque = !!data.comptebloque;
    if (cible.comptebloque) {
      cible.tokenVersion = (cible.tokenVersion || 0) + 1; // révoque ses jetons
    }
  }

  // Mot de passe : rehash + révocation des anciens jetons
  if (data.password) {
    cible.password = await hashPassword(data.password);
    cible.tokenVersion = (cible.tokenVersion || 0) + 1;
    cible.isLocked = false;
    cible.failedAttempts = 0;
    cible.remainingAttempts = 4;
  }

  await cible.save();
  const { password: _pw, ...sansMotDePasse } = cible.toObject();
  return NextResponse.json({
    utilisateur: { ...sansMotDePasse, _id: cible._id.toString() },
  });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gestion_utilisateurs"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }
  if (id === user!._id) {
    return NextResponse.json(
      { message: "Impossible de supprimer votre propre compte." },
      { status: 400 }
    );
  }

  await db();
  const cible = await User.findOne(filtreUser(user, id)).lean();
  if (!cible) {
    return NextResponse.json({ message: "Utilisateur introuvable" }, { status: 404 });
  }

  // Garde-fou : ne pas supprimer le dernier administrateur de l'entreprise
  if (cible.type === "admin") {
    const nbAdmins = await User.countDocuments({
      entrepriseId: user!.entrepriseId,
      type: "admin",
    });
    if (nbAdmins <= 1) {
      return NextResponse.json(
        { message: "Impossible de supprimer le dernier administrateur." },
        { status: 400 }
      );
    }
  }

  await User.deleteOne({ _id: cible._id });
  return NextResponse.json({ message: "Utilisateur supprimé" });
}
