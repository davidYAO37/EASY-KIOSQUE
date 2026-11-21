import type { Connection } from "mongoose";
import { hashPassword, generateLocalUID } from "@/utils/auth";

/**
 * Données par défaut injectées au premier démarrage.
 *
 * EASY-KIOSQUE est multi-tenant : les entreprises se créent via
 * l'inscription (`/api/inscription`). Le seed ne crée que le compte
 * super-administrateur de la plateforme.
 */
export async function seedDefaultDataForConnection(conn: Connection) {
  const created: string[] = [];

  // Import dynamique : les modèles sont déjà enregistrés via ../models
  const { User } = await import("@/models/users.model");

  // Compte super-admin plateforme (à changer à la première connexion)
  const adminExists = await User.findOne({ email: "superadmin@easy-kiosque.local" });
  if (!adminExists) {
    await User.create({
      nom: "Super",
      prenom: "Administrateur",
      name: "Super Administrateur EASY-KIOSQUE",
      email: "superadmin@easy-kiosque.local",
      password: await hashPassword("admin123"),
      type: "adminsuper",
      entrepriseId: null,
      uid: generateLocalUID(),
    });
    created.push("user:superadmin@easy-kiosque.local");
  }

  // Plans d'abonnement par défaut de la plateforme
  const { Plan } = await import("@/models/plan");
  const plans = [
    { code: "ESSAI", nom: "Essai gratuit", prixMensuel: 0, dureeEssaiJours: 30, maxKiosques: 1, maxUtilisateurs: 3, description: "Découverte — 1 kiosque, 3 utilisateurs, tous les modules" },
    { code: "KIOSQUE", nom: "Kiosque", prixMensuel: 10000, dureeEssaiJours: 0, maxKiosques: 3, maxUtilisateurs: 10, description: "Jusqu'à 3 kiosques, 10 utilisateurs, rapports & exports" },
    { code: "ENTREPRISE", nom: "Entreprise", prixMensuel: 25000, dureeEssaiJours: 0, maxKiosques: 0, maxUtilisateurs: 0, description: "Kiosques et utilisateurs illimités, support prioritaire" },
  ];
  for (const p of plans) {
    const existe = await Plan.findOne({ code: p.code });
    if (!existe) {
      await Plan.create(p);
      created.push(`plan:${p.code}`);
    }
  }

  return created;
}
