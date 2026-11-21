import { NextResponse, NextRequest } from "next/server";
import mongoose from "mongoose";
import { avecTransaction } from "@/lib/transaction";
import { hashPassword, generateLocalUID } from "@/utils/auth";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { Entreprise } from "@/models/entreprise";
import { Profil } from "@/models/profil";
import { Categorie } from "@/models/categorie";
import { CategorieDepense } from "@/models/categorieDepense";
import { Produit } from "@/models/produit";
import { Sequence } from "@/models/sequence";
import { inscriptionSchema } from "@/lib/validations";

const PROFILS_DEFAUT = [
  { profil: "Administrateur", type: "admin" },
  { profil: "Gestionnaire", type: "gestionnaire" },
  { profil: "Responsable kiosque", type: "responsable" },
  { profil: "Caissier", type: "caissier" },
  { profil: "Vendeur", type: "vendeur" },
  { profil: "Comptable", type: "comptable" },
];

const CATEGORIES_DEFAUT = [
  { code: "CAT001", libelle: "Petit-déjeuner", ordre: 1 },
  { code: "CAT002", libelle: "Plats & Grillades", ordre: 2 },
  { code: "CAT003", libelle: "Collations & Beignets", ordre: 3 },
  { code: "CAT004", libelle: "Boissons", ordre: 4 },
  { code: "CAT005", libelle: "Marchandises", ordre: 5 },
  { code: "CAT006", libelle: "Divers", ordre: 99 },
];

/** Catégories de dépenses de démarrage — typologie courante d'un kiosque. */
const CATEGORIES_DEPENSES_DEFAUT = [
  { code: "CD001", designation: "Fournisseurs & Achats" },
  { code: "CD002", designation: "Loyer" },
  { code: "CD003", designation: "Salaires & Charges" },
  { code: "CD004", designation: "Transport" },
  { code: "CD005", designation: "Eau & Électricité" },
  { code: "CD099", designation: "Divers" },
];

/**
 * Catalogue de démarrage — menu type d'un kiosque / cafétéria ivoirienne.
 * Prix indicatifs en FCFA (tarifs de rue Abidjan, ajustables par le
 * propriétaire). `cat` = index dans CATEGORIES_DEFAUT.
 * FABRIQUE = préparé sur place · REVENTE = marchandise revendue · MIXTE.
 */
const PRODUITS_DEFAUT: {
  designation: string; cat: number; type: "FABRIQUE" | "REVENTE" | "MIXTE"; prix: number;
}[] = [
  // ---- Petit-déjeuner (CAT001) ----
  { designation: "Café", cat: 0, type: "FABRIQUE", prix: 200 },
  { designation: "Café au lait", cat: 0, type: "FABRIQUE", prix: 300 },
  { designation: "Thé", cat: 0, type: "FABRIQUE", prix: 200 },
  { designation: "Chocolat", cat: 0, type: "FABRIQUE", prix: 300 },
  { designation: "Omelette nature", cat: 0, type: "FABRIQUE", prix: 300 },
  { designation: "Pain omelette", cat: 0, type: "FABRIQUE", prix: 500 },
  { designation: "Pain condiment", cat: 0, type: "FABRIQUE", prix: 500 },
  { designation: "Pain saucisson", cat: 0, type: "FABRIQUE", prix: 500 },
  { designation: "Spaghetti", cat: 0, type: "FABRIQUE", prix: 500 },
  { designation: "Spaghetti œuf", cat: 0, type: "FABRIQUE", prix: 700 },
  { designation: "Spaghetti viande", cat: 0, type: "FABRIQUE", prix: 1000 },
  { designation: "Bouillie (bacca)", cat: 0, type: "FABRIQUE", prix: 300 },
  // ---- Plats & Grillades (CAT002) ----
  { designation: "Garba (attiéké + thon frit)", cat: 1, type: "FABRIQUE", prix: 1000 },
  { designation: "Alloco", cat: 1, type: "FABRIQUE", prix: 500 },
  { designation: "Alloco + œuf", cat: 1, type: "FABRIQUE", prix: 700 },
  { designation: "Attiéké poisson frit", cat: 1, type: "FABRIQUE", prix: 1500 },
  { designation: "Attiéké poisson braisé", cat: 1, type: "FABRIQUE", prix: 2000 },
  { designation: "Riz sauce", cat: 1, type: "FABRIQUE", prix: 700 },
  { designation: "Riz jollof", cat: 1, type: "FABRIQUE", prix: 1000 },
  { designation: "Placali sauce kopè", cat: 1, type: "FABRIQUE", prix: 1500 },
  { designation: "Foutou banane sauce", cat: 1, type: "FABRIQUE", prix: 1500 },
  { designation: "Kédjénou poulet", cat: 1, type: "FABRIQUE", prix: 2500 },
  { designation: "Poulet braisé (portion)", cat: 1, type: "FABRIQUE", prix: 2500 },
  { designation: "Choukouya bœuf", cat: 1, type: "FABRIQUE", prix: 1000 },
  { designation: "Sauce graine + foutou", cat: 1, type: "FABRIQUE", prix: 2000 },
  // ---- Collations & Beignets (CAT003) ----
  { designation: "Beignets", cat: 2, type: "FABRIQUE", prix: 200 },
  { designation: "Croquettes", cat: 2, type: "FABRIQUE", prix: 200 },
  { designation: "Banane braisée", cat: 2, type: "FABRIQUE", prix: 200 },
  { designation: "Pastels", cat: 2, type: "FABRIQUE", prix: 200 },
  { designation: "Chips plantain", cat: 2, type: "REVENTE", prix: 500 },
  // ---- Boissons (CAT004) ----
  { designation: "Jus de gingembre", cat: 3, type: "FABRIQUE", prix: 300 },
  { designation: "Jus de bissap", cat: 3, type: "FABRIQUE", prix: 300 },
  { designation: "Jus de tamarin", cat: 3, type: "FABRIQUE", prix: 300 },
  { designation: "Eau minérale", cat: 3, type: "REVENTE", prix: 500 },
  { designation: "Boisson gazeuse", cat: 3, type: "REVENTE", prix: 500 },
  { designation: "Énergisant", cat: 3, type: "REVENTE", prix: 1000 },
  { designation: "Bière", cat: 3, type: "REVENTE", prix: 750 },
  // ---- Marchandises (CAT005) ----
  { designation: "Pain sucré", cat: 4, type: "REVENTE", prix: 200 },
  { designation: "Biscuits", cat: 4, type: "REVENTE", prix: 200 },
  { designation: "Bonbons", cat: 4, type: "REVENTE", prix: 100 },
  { designation: "Conserve sardine", cat: 4, type: "REVENTE", prix: 800 },
  { designation: "Conserve thon", cat: 4, type: "REVENTE", prix: 1200 },
];

/**
 * Inscription SaaS : crée l'entreprise (tenant) + son compte
 * administrateur + les profils par défaut, dans une transaction.
 * Route publique (pas de session requise).
 */
export async function POST(req: NextRequest) {
  try {
    await db();
    const body = await req.json();
    const parsed = inscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Données invalides", erreurs: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { entreprise: e, admin } = parsed.data;

    const emailAdmin = admin.email.toLowerCase().trim();
    const existe = await User.findOne({ email: emailAdmin }).select("_id").lean();
    if (existe) {
      return NextResponse.json(
        { message: "Cet identifiant est déjà utilisé par un autre compte." },
        { status: 409 }
      );
    }

    let entrepriseId: mongoose.Types.ObjectId | null = null;
    await avecTransaction(async (session) => {
        const [ent] = await Entreprise.create(
          [
            {
              nomSociete: e.nomSociete,
              nomCommercial: e.nomCommercial || undefined,
              telephone: e.telephone || undefined,
              email: e.email || undefined,
              adresse: e.adresse || undefined,
              ville: e.ville || undefined,
              devise: "FCFA",
              statut: "actif",
              // Essai gratuit de 30 jours pour toute nouvelle entreprise
              abonnementPlan: "ESSAI",
              abonnementExpireLe: new Date(Date.now() + 30 * 86400_000),
            },
          ],
          { session }
        );
        entrepriseId = ent._id as mongoose.Types.ObjectId;

        await User.create(
          [
            {
              nom: admin.nom,
              prenom: admin.prenom || undefined,
              name: `${admin.nom} ${admin.prenom || ""}`.trim(),
              email: emailAdmin,
              password: await hashPassword(admin.password),
              type: "admin",
              entrepriseId: ent._id,
              uid: generateLocalUID(),
            },
          ],
          { session }
        );

        await Profil.insertMany(
          PROFILS_DEFAUT.map((p) => ({ ...p, entrepriseId: ent._id })),
          { session }
        );

        const cats = await Categorie.insertMany(
          CATEGORIES_DEFAUT.map((c) => ({ ...c, entrepriseId: ent._id, statut: "actif" })),
          { session }
        );

        // Catalogue de démarrage : codes P0001…, rattachés à leur catégorie
        await Produit.insertMany(
          PRODUITS_DEFAUT.map((p, i) => ({
            entrepriseId: ent._id,
            code: `P${String(i + 1).padStart(4, "0")}`,
            designation: p.designation,
            categorieId: cats[p.cat]._id,
            typeProduit: p.type,
            prixVente: p.prix,
            statut: "actif",
          })),
          { session }
        );

        await CategorieDepense.insertMany(
          CATEGORIES_DEPENSES_DEFAUT.map((c) => ({ ...c, entrepriseId: ent._id, statut: "actif" })),
          { session }
        );

        // Compteurs de codes alignés sur les données par défaut
        await Sequence.insertMany(
          [
            {
              entrepriseId: ent._id,
              kiosqueId: null,
              cle: "code_categorie",
              valeur: CATEGORIES_DEFAUT.length,
            },
            {
              entrepriseId: ent._id,
              kiosqueId: null,
              cle: "code_produit",
              valeur: PRODUITS_DEFAUT.length,
            },
            {
              entrepriseId: ent._id,
              kiosqueId: null,
              cle: "code_categorie_depense",
              valeur: CATEGORIES_DEPENSES_DEFAUT.length,
            },
          ],
          { session }
        );
      }
    );

    return NextResponse.json(
      {
        message: "Entreprise créée avec succès",
        entrepriseId: entrepriseId ? String(entrepriseId) : null,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Erreur inscription:", error);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
