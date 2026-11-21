import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Categorie } from "@/models/categorie";
import { categorieSchema } from "@/lib/validations";
import { majCategorie, supprimerCategorie } from "@/services/catalogue.service";

type Ctx = { params: Promise<{ id: string }> };
const AUTORISES = ["admin", "gestionnaire"];

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const categorie = await Categorie.findOne({
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user!.entrepriseId!),
  }).lean();
  if (!categorie) {
    return NextResponse.json({ message: "Catégorie introuvable" }, { status: 404 });
  }
  return NextResponse.json({ categorie: { ...categorie, _id: categorie._id.toString() } });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gerer_produits"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  const parsed = categorieSchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const categorie = await majCategorie(user!.entrepriseId!, id, parsed.data);
    if (!categorie) {
      return NextResponse.json({ message: "Catégorie introuvable" }, { status: 404 });
    }
    return NextResponse.json({ categorie: { ...categorie, _id: categorie._id.toString() } });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req, AUTORISES, {
    actions: ["gerer_produits"],
  });
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const res = await supprimerCategorie(user!.entrepriseId!, id);
  if (!res.supprimee && !res.desactivee) {
    return NextResponse.json({ message: "Catégorie introuvable" }, { status: 404 });
  }
  if (res.desactivee) {
    return NextResponse.json({
      message: `Catégorie utilisée par ${res.usage} produit(s) : elle a été désactivée.`,
      desactivee: true,
    });
  }
  return NextResponse.json({ message: "Catégorie supprimée" });
}
