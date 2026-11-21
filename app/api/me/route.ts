import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db/mongoConnect";
import { User } from "@/models/users.model";
import { profilPersoSchema } from "@/lib/validations";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
  }

  // Infos d'affichage de l'entreprise (nom, devise, logo) pour le header
  let entreprise = null;
  if (user.entrepriseId) {
    const { Entreprise } = await import("@/models/entreprise");
    const { etatAbonnement } = await import("@/lib/abonnement");
    const ent = await Entreprise.findById(user.entrepriseId);
    if (ent) {
      const abo = await etatAbonnement(ent);
      entreprise = {
        _id: ent._id.toString(),
        nomSociete: ent.nomSociete,
        nomCommercial: ent.nomCommercial,
        devise: ent.devise || "FCFA",
        logo: ent.logo,
        statut: ent.statut,
        abonnement: {
          planCode: abo.planCode,
          planNom: abo.planNom,
          statut: abo.statut,
          expireLe: abo.expireLe,
          joursRestants: abo.joursRestants,
        },
      };
    }
  }

  return NextResponse.json({ user, entreprise });
}

/**
 * Mise à jour du profil personnel : nom, prénom, téléphone.
 * Le rôle, les permissions, l'email et l'entreprise ne sont JAMAIS
 * modifiables ici (sécurité : pas d'élévation de droits par cette route).
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = profilPersoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Données invalides", erreurs: parsed.error.issues }, { status: 400 });
  }

  await db();
  const maj: Record<string, any> = {};
  if (parsed.data.nom !== undefined) maj.nom = parsed.data.nom;
  if (parsed.data.prenom !== undefined) maj.prenom = parsed.data.prenom;
  if (parsed.data.telephone !== undefined) maj.telephone = parsed.data.telephone || null;
  if (Object.keys(maj).length === 0) {
    return NextResponse.json({ message: "Rien à modifier" }, { status: 400 });
  }

  await User.findByIdAndUpdate(user._id, { $set: maj });
  return NextResponse.json({ message: "Profil mis à jour" });
}
