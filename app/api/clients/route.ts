import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { clientSchema } from "@/lib/validations";
import {
  chercherClients,
  creerClient,
  listerClients,
} from "@/services/clients.service";

/**
 * GET : liste paginée des clients (paramètre `recherche=1&q=...` pour le
 * sélecteur rapide du POS). Lecture ouverte à tout utilisateur du tenant —
 * le vendeur en a besoin pour identifier le client d'une vente à crédit.
 */
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  await db();
  const sp = req.nextUrl.searchParams;
  if (sp.get("recherche") === "1") {
    const clients = await chercherClients(
      user!.entrepriseId!,
      sp.get("q") || ""
    );
    return NextResponse.json({ clients });
  }
  const liste = await listerClients(user!.entrepriseId!, {
    q: sp.get("q") || undefined,
    statut: sp.get("statut") || undefined,
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
  });
  return NextResponse.json(liste);
}

/**
 * POST : création d'une fiche client. Ouverte à tout utilisateur du tenant
 * (le vendeur doit pouvoir identifier un client avant une vente à crédit) ;
 * la modification/suppression reste réservée aux gestionnaires.
 */
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req);
  if (error) return error;

  const parsed = clientSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Données invalides", erreurs: parsed.error.flatten() },
      { status: 400 }
    );
  }

  await db();
  try {
    const client = await creerClient(user!.entrepriseId!, parsed.data);
    return NextResponse.json({ client }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { message: e?.message || "Erreur" },
      { status: e?.status || 500 }
    );
  }
}
