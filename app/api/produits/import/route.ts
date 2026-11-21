import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { importerProduits } from "@/services/catalogue.service";

const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo

/**
 * Import Excel du catalogue — fichier .xlsx en multipart (champ `fichier`).
 * Colonnes : Code | Désignation | Catégorie | Type | Prix achat |
 * Prix vente | Description. Upsert par code produit.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req, ["admin", "gestionnaire"], {
    actions: ["gerer_produits"],
  });
  if (error) return error;

  let fichier: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("fichier");
    fichier = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ message: "Fichier invalide" }, { status: 400 });
  }
  if (!fichier) {
    return NextResponse.json({ message: "Aucun fichier fourni (champ « fichier »)" }, { status: 400 });
  }
  if (fichier.size > TAILLE_MAX) {
    return NextResponse.json({ message: "Fichier trop volumineux (max 5 Mo)" }, { status: 400 });
  }

  const nom = fichier.name.toLowerCase();
  if (!nom.endsWith(".xlsx") && !nom.endsWith(".xls")) {
    return NextResponse.json(
      { message: "Format non supporté — utilisez un fichier Excel (.xlsx)" },
      { status: 400 }
    );
  }

  await db();
  try {
    const buffer = Buffer.from(await fichier.arrayBuffer());
    const resultat = await importerProduits(user!.entrepriseId!, buffer);
    return NextResponse.json({
      message: `${resultat.crees} produit(s) créé(s), ${resultat.majs} mis à jour, ${resultat.erreurs.length} erreur(s)`,
      ...resultat,
    });
  } catch (e: any) {
    console.error("Erreur import produits:", e);
    return NextResponse.json(
      { message: "Fichier illisible ou erreur d'import" },
      { status: 400 }
    );
  }
}
