import { Entreprise, IEntreprise } from "@/models/entreprise";
import { Plan } from "@/models/plan";
import { Kiosque } from "@/models/kiosque";
import { User } from "@/models/users.model";
import { Types } from "mongoose";

/**
 * Abonnements SaaS — état courant, limites de plan, essai par défaut.
 *
 * - Toute entreprise SANS abonnement reçoit un essai de 30 jours à la
 *   première vérification (migration douce des comptes existants).
 * - `expireLe` passé → période de grâce de GRACE_JOURS, puis 402
 *   ABONNEMENT_EXPIRE sur toutes les API métier.
 * - `maxKiosques`/`maxUtilisateurs` = 0 → illimité.
 */

export const GRACE_JOURS = 5;
export const ESSAI_JOURS = 30; // repli si le plan ESSAI est absent
export const PLAN_ESSAI = "ESSAI";

export interface EtatAbonnement {
  planCode: string;
  planNom: string;
  statut: "essai" | "actif" | "expire" | "grace";
  expireLe: Date;
  joursRestants: number;
  maxKiosques: number;
  maxUtilisateurs: number;
}

/**
 * Durée d'essai en jours — lue depuis le plan ESSAI saisi par le
 * super-admin en base ; repli sur ESSAI_JOURS si le plan est absent.
 * 0 = aucun essai (expiration immédiate, grâce conservée).
 */
export async function dureeEssaiJours(): Promise<number> {
  const plan = await Plan.findOne({ code: PLAN_ESSAI })
    .select("dureeEssaiJours")
    .lean();
  return plan?.dureeEssaiJours ?? ESSAI_JOURS;
}

/**
 * Calcule l'état d'abonnement d'une entreprise. Si l'entreprise n'a
 * jamais eu d'abonnement, un essai lui est provisionné (lazy) selon
 * la durée du plan ESSAI — `ent` doit être un document Mongoose
 * modifiable.
 */
export async function etatAbonnement(ent: IEntreprise): Promise<EtatAbonnement> {
  const maintenant = new Date();

  if (!ent.abonnementPlan || !ent.abonnementExpireLe) {
    ent.abonnementPlan = PLAN_ESSAI;
    ent.abonnementExpireLe = new Date(
      maintenant.getTime() + (await dureeEssaiJours()) * 86400_000
    );
    await ent.save();
  }

  const plan = await Plan.findOne({ code: ent.abonnementPlan })
    .select("nom maxKiosques maxUtilisateurs")
    .lean();
  const expireLe = ent.abonnementExpireLe!;
  const finGrace = new Date(expireLe.getTime() + GRACE_JOURS * 86400_000);
  const joursRestants = Math.ceil((expireLe.getTime() - maintenant.getTime()) / 86400_000);

  let statut: EtatAbonnement["statut"];
  if (maintenant > finGrace) statut = "expire";
  else if (maintenant > expireLe) statut = "grace";
  else statut = ent.abonnementPlan === PLAN_ESSAI ? "essai" : "actif";

  return {
    planCode: ent.abonnementPlan,
    planNom: plan?.nom || ent.abonnementPlan,
    statut,
    expireLe,
    joursRestants,
    maxKiosques: plan?.maxKiosques ?? 1,
    maxUtilisateurs: plan?.maxUtilisateurs ?? 3,
  };
}

/**
 * Vérifie qu'un ajout respecte la limite du plan. `quoi` ∈
 * "kiosque" | "utilisateur". Renvoie `null` si OK, sinon un message.
 */
export async function verifierLimitePlan(
  entrepriseId: string,
  quoi: "kiosque" | "utilisateur"
): Promise<string | null> {
  const ent = await Entreprise.findById(new Types.ObjectId(entrepriseId));
  if (!ent) return "Entreprise introuvable";
  const etat = await etatAbonnement(ent);

  if (quoi === "kiosque") {
    if (etat.maxKiosques === 0) return null;
    const actuels = await Kiosque.countDocuments({ entrepriseId: ent._id });
    if (actuels >= etat.maxKiosques) {
      return `Limite du plan ${etat.planNom} atteinte : ${etat.maxKiosques} kiosque(s) maximum. Passez à un plan supérieur ou contactez la plateforme.`;
    }
  } else {
    if (etat.maxUtilisateurs === 0) return null;
    const actuels = await User.countDocuments({ entrepriseId: ent._id });
    if (actuels >= etat.maxUtilisateurs) {
      return `Limite du plan ${etat.planNom} atteinte : ${etat.maxUtilisateurs} utilisateur(s) maximum. Passez à un plan supérieur ou contactez la plateforme.`;
    }
  }
  return null;
}
