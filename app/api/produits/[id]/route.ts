import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { Produit } from "@/models/produit";
import { produitUpdateSchema } from "@/lib/validations";
import { desactiverProduit, majProduit } from "@/services/catalogue.service";
import { JournalActivite } from "@/models/journalActivite";

type Ctx = { params: Promise<{ id: string }> };
const AUTORISES = ["admin", "gestionnaire"];

function filtre(user: any, id: string) {
  return {
    _id: new Types.ObjectId(id),
    entrepriseId: new Types.ObjectId(user.entrepriseId),
  };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ message: "Identifiant invalide" }, { status: 400 });
  }

  await db();
  const p = await Produit.findOne(filtre(user, id))
    .populate("categorieId", "code libelle")
    .lean();
  if (!p) {
    return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
  }
  return NextResponse.json({ produit: { ...p, _id: p._id.toString() } });
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

  const parsed = produitUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    // Journalisation tarifaire : toute modification de prix est tracée
    // (ancienne valeur → nouvelle valeur, auteur, date) — le tarif est la
    // donnée la plus sensible, réservée au propriétaire.
    const touchePrix =
      parsed.data.prixVente !== undefined || parsed.data.prixKiosques !== undefined;
    const avant = touchePrix
      ? await Produit.findOne(filtre(user, id)).select("code prixVente prixKiosques").lean()
      : null;

    const p = await majProduit(user!.entrepriseId!, id, parsed.data);
    if (!p) {
      return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
    }
    if (avant) {
      await JournalActivite.create({
        entrepriseId: new Types.ObjectId(user!.entrepriseId!),
        userId: new Types.ObjectId(user!._id),
        action: "modification_tarifaire",
        module: "produits",
        details: {
          produitId: id,
          code: avant.code,
          avant: { prixVente: avant.prixVente, prixKiosques: avant.prixKiosques },
          apres: { prixVente: p.prixVente, prixKiosques: p.prixKiosques },
        },
      });
    }
    return NextResponse.json({ produit: { ...p, _id: p._id.toString() } });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}

/** Soft-delete : le produit est désactivé, jamais supprimé physiquement. */
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
  const p = await desactiverProduit(user!.entrepriseId!, id);
  if (!p) {
    return NextResponse.json({ message: "Produit introuvable" }, { status: 404 });
  }
  return NextResponse.json({ message: "Produit désactivé" });
}
