import { z } from "zod";
import { MODES_PAIEMENT } from "./format";

/**
 * Schémas de validation Zod — validation centralisée des corps de requête.
 * Chaque route API valide son body avant d'appeler le service métier.
 */

export const inscriptionSchema = z.object({
  entreprise: z.object({
    nomSociete: z.string().trim().min(2).max(150),
    nomCommercial: z.string().trim().max(150).optional().or(z.literal("")),
    telephone: z.string().trim().max(30).optional().or(z.literal("")),
    email: z.string().trim().email().max(150).optional().or(z.literal("")),
    adresse: z.string().trim().max(300).optional().or(z.literal("")),
    ville: z.string().trim().max(100).optional().or(z.literal("")),
  }),
  admin: z.object({
    nom: z.string().trim().min(1).max(80),
    prenom: z.string().trim().max(80).optional().or(z.literal("")),
    email: z.string().trim().email().max(150),
    password: z.string().min(6).max(200),
  }),
});

export const entrepriseUpdateSchema = z.object({
  nomSociete: z.string().trim().min(2).max(150).optional(),
  nomCommercial: z.string().trim().max(150).optional(),
  telephone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().max(150).optional().or(z.literal("")),
  adresse: z.string().trim().max(300).optional(),
  ville: z.string().trim().max(100).optional(),
  pays: z.string().trim().max(100).optional(),
  logo: z.string().max(700_000).optional(), // data URI ≤ ~500 Ko
  devise: z.string().trim().max(10).optional(),
  impression: z
    .object({
      imprimanteDefaut: z.string().trim().max(120).optional().or(z.literal("")),
      format: z.enum(["thermique80", "a4"]).optional(),
      impressionAuto: z.boolean().optional(),
    })
    .optional(),
  stock: z
    .object({
      actif: z.boolean().optional(),
      venteSansStockAutorisee: z.boolean().optional(),
    })
    .optional(),
  delaiDemandeAnnulationH: z.number().int().min(0).max(720).optional(),
});

// ---------- Stock (par kiosque, produits REVENTE) ----------

export const stockEntreeSchema = z.union([
  z.object({
    kiosqueId: z.string().min(1),
    produitId: z.string().min(1),
    quantite: z.number().int().positive().max(1_000_000),
    motif: z.string().trim().max(300).optional().or(z.literal("")),
  }),
  z.object({
    kiosqueId: z.string().min(1),
    motif: z.string().trim().max(300).optional().or(z.literal("")),
    lignes: z
      .array(
        z.object({
          produitId: z.string().min(1),
          quantite: z.number().int().positive().max(1_000_000),
        })
      )
      .min(1)
      .max(500),
  }),
]);

export const stockAjustementSchema = z.union([
  z.object({
    kiosqueId: z.string().min(1),
    produitId: z.string().min(1),
    nouvelleQuantite: z.number().int().min(0).max(1_000_000),
    motif: z.string().trim().min(3).max(300),
  }),
  z.object({
    kiosqueId: z.string().min(1),
    motif: z.string().trim().min(3).max(300),
    lignes: z
      .array(
        z.object({
          produitId: z.string().min(1),
          nouvelleQuantite: z.number().int().min(0).max(1_000_000),
        })
      )
      .min(1)
      .max(500),
  }),
]);

export const kiosqueSchema = z.object({
  code: z.string().trim().max(20).optional().or(z.literal("")),
  designation: z.string().trim().min(2).max(120),
  adresse: z.string().trim().max(300).optional().or(z.literal("")),
  telephone: z.string().trim().max(30).optional().or(z.literal("")),
  responsable: z.string().trim().max(120).optional().or(z.literal("")),
  statut: z.enum(["actif", "inactif"]).optional(),
});

const permissionsSchema = z.object({
  services: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
  customized: z.boolean().optional(),
});

export const utilisateurCreateSchema = z.object({
  nom: z.string().trim().min(1).max(80),
  prenom: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email().max(150),
  password: z.string().min(6).max(200),
  type: z.string().trim().max(40).optional(),
  kiosqueIds: z.array(z.string()).max(200).optional(),
  profilId: z.string().optional().or(z.literal("")).or(z.null()),
  comptebloque: z.boolean().optional(),
  permissions: permissionsSchema.optional(),
});

export const utilisateurUpdateSchema = utilisateurCreateSchema
  .omit({ password: true })
  .extend({ password: z.string().min(6).max(200).optional().or(z.literal("")) })
  .partial();

export const profilSchema = z.object({
  profil: z.string().trim().min(2).max(80),
  type: z.string().trim().max(40).optional(),
  customized: z.boolean().optional(),
  services: z.array(z.string()).optional(),
  actions: z.array(z.string()).optional(),
});

// ---------- Catalogue (Phase 2) ----------

export const categorieSchema = z.object({
  code: z.string().trim().max(20).optional().or(z.literal("")),
  libelle: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  ordre: z.number().int().min(0).max(9999).optional(),
  statut: z.enum(["actif", "inactif"]).optional(),
});

export const prixKiosqueSchema = z.object({
  kiosqueId: z.string().min(1),
  prixVente: z.number().min(0),
});

export const produitSchema = z.object({
  code: z.string().trim().max(30).optional().or(z.literal("")),
  codeBarre: z.string().trim().max(30).optional().or(z.literal("")).or(z.null()),
  designation: z.string().trim().min(2).max(150),
  categorieId: z.string().optional().or(z.literal("")).or(z.null()),
  typeProduit: z.enum(["FABRIQUE", "REVENTE", "MIXTE"]).optional(),
  prixAchat: z.number().min(0).optional().or(z.null()),
  prixVente: z.number().min(0),
  seuilAlerte: z.number().int().min(0).max(1_000_000).optional().or(z.null()),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  image: z.string().max(700_000).optional().or(z.literal("")), // data URI ≤ ~500 Ko
  prixKiosques: z.array(prixKiosqueSchema).max(500).optional(),
  statut: z.enum(["actif", "inactif"]).optional(),
});

export const produitUpdateSchema = produitSchema.partial().extend({
  prixVente: z.number().min(0).optional(),
});

// ---------- Clients & Ventes (Phase 3) ----------

export const clientSchema = z.object({
  code: z.string().trim().max(30).optional().or(z.literal("")),
  nom: z.string().trim().min(1).max(100),
  prenoms: z.string().trim().max(100).optional().or(z.literal("")),
  telephone: z.string().trim().max(30).optional().or(z.literal("")),
  adresse: z.string().trim().max(300).optional().or(z.literal("")),
  plafondCredit: z.number().min(0).optional().or(z.null()),
  statut: z.enum(["actif", "inactif"]).optional(),
});

/**
 * Ligne de panier : SEUL produitId + quantite sont acceptés.
 * .strict() rejette toute tentative d'envoyer prixUnitaire / remise /
 * montant — les prix et totaux sont calculés exclusivement côté serveur.
 */
const ligneVenteInputSchema = z
  .object({
    produitId: z.string().min(1).max(40),
    quantite: z.number().int().min(1).max(10_000),
  })
  .strict();

const paiementInputSchema = z
  .object({
    mode: z.enum(MODES_PAIEMENT),
    montant: z.number().min(1).max(1_000_000_000),
    montantRecu: z.number().min(0).max(1_000_000_000).optional(),
  })
  .strict();

/**
 * Vente à valider. .strict() => tout champ inconnu (remise, prix, total)
 * provoque un 400 : aucune réduction ni tarif libre en V1.
 */
export const venteCreateSchema = z
  .object({
    kiosqueId: z.string().min(1).max(40),
    clientId: z.string().optional().or(z.literal("")).or(z.null()),
    typeVente: z.enum(["comptant", "credit"]),
    lignes: z.array(ligneVenteInputSchema).min(1).max(200),
    paiements: z.array(paiementInputSchema).max(10).optional().default([]),
    idempotencyKey: z.string().trim().min(8).max(80),
    // Marqueurs du mode hors-ligne : informatifs uniquement — la date de
    // vente reste celle du serveur, jamais celle du client.
    horsLigne: z.boolean().optional(),
    miseEnFileLe: z.string().trim().max(40).optional(),
  })
  .strict();

export const venteAnnulationSchema = z
  .object({
    motif: z.string().trim().min(3).max(300),
  })
  .strict();

// ---------- Crédits & Remboursements (Phase 4) ----------

/**
 * Remboursement : soit une ventilation explicite par créance
 * (`allocations`), soit un montant global réparti automatiquement
 * sur les créances du client, de la plus ancienne à la plus récente.
 */
export const remboursementSchema = z
  .object({
    kiosqueId: z.string().min(1).max(40),
    clientId: z.string().min(1).max(40),
    montant: z.number().min(1).max(1_000_000_000),
    mode: z.enum(MODES_PAIEMENT),
    reference: z.string().trim().max(80).optional().or(z.literal("")),
    allocations: z
      .array(
        z
          .object({
            creanceId: z.string().min(1).max(40),
            montant: z.number().min(1).max(1_000_000_000),
          })
          .strict()
      )
      .max(100)
      .optional(),
    idempotencyKey: z.string().trim().min(8).max(80),
  })
  .strict();

// ---------- Caisses & Remises (Phase 5) ----------

/** Ouverture de caisse : fond de caisse éventuel (≥ 0). */
export const ouvertureCaisseSchema = z
  .object({
    kiosqueId: z.string().min(1).max(40),
    fondDeCaisse: z.number().min(0).max(100_000_000).default(0),
  })
  .strict();

/** Point journalier déclaré par l'opérateur : montant réellement compté. */
export const pointCaisseSchema = z
  .object({
    montantCompte: z.number().min(0).max(1_000_000_000),
    commentaire: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .strict();

/** Clôture ou rejet de point par un profil autorisé. */
export const clotureCaisseSchema = z
  .object({
    commentaire: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .strict();

/** Déclaration de remise d'argent (vendeur → propriétaire). */
export const remiseSchema = z
  .object({
    kiosqueId: z.string().min(1).max(40),
    montant: z.number().min(1).max(1_000_000_000),
    note: z.string().trim().max(300).optional().or(z.literal("")),
    idempotencyKey: z.string().trim().min(8).max(80),
  })
  .strict();

/** Annulation d'une remise déclarée : motif obligatoire. */
export const remiseAnnulationSchema = z
  .object({
    motif: z.string().trim().min(3).max(300),
  })
  .strict();

/** Création d'une catégorie de dépense. */
export const categorieDepenseSchema = z
  .object({
    designation: z.string().trim().min(2).max(80),
  })
  .strict();

/** Mise à jour d'une catégorie de dépense. */
export const categorieDepenseUpdateSchema = z
  .object({
    designation: z.string().trim().min(2).max(80).optional(),
    statut: z.enum(["actif", "inactif"]).optional(),
  })
  .strict();

/** Enregistrement d'une dépense — sortie d'argent du tiroir-caisse. */
export const depenseSchema = z
  .object({
    kiosqueId: z.string().min(1).max(40),
    categorieDepenseId: z.string().min(1).max(40).optional().nullable(),
    montant: z.number().min(1).max(1_000_000_000),
    motif: z.string().trim().max(300).optional().or(z.literal("")),
    dateDepense: z.string().trim().max(30).optional().or(z.literal("")),
    idempotencyKey: z.string().trim().min(8).max(80),
  })
  .strict();

/** Annulation d'une dépense validée : motif obligatoire. */
export const depenseAnnulationSchema = z
  .object({
    motif: z.string().trim().min(3).max(300),
  })
  .strict();

/** Mise à jour du profil personnel (nom/prénom uniquement). */
export const profilPersoSchema = z
  .object({
    nom: z.string().trim().min(1).max(80).optional(),
    prenom: z.string().trim().min(1).max(80).optional(),
    telephone: z.string().trim().max(30).optional().or(z.literal("")),
  })
  .strict();

/** Changement de son propre mot de passe : ancien requis. */
export const changementMdpSchema = z
  .object({
    ancienMotDePasse: z.string().min(1).max(200),
    nouveauMotDePasse: z.string().min(6).max(200),
  })
  .strict();

/** Demande de réinitialisation de mot de passe (mot de passe oublié). */
export const resetDemandeSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(200),
  })
  .strict();

/** Réinitialisation effective : jeton reçu par email + nouveau mot de passe. */
export const resetConfirmeSchema = z
  .object({
    token: z.string().trim().min(20).max(200),
    nouveauMotDePasse: z.string().min(6).max(200),
  })
  .strict();

/** Création / mise à jour d'un plan d'abonnement (super-admin). */
export const planSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(2).max(20),
    nom: z.string().trim().min(2).max(60),
    prixMensuel: z.number().min(0).max(100_000_000),
    dureeEssaiJours: z.number().int().min(0).max(365).optional(),
    maxKiosques: z.number().int().min(0).max(1000),
    maxUtilisateurs: z.number().int().min(0).max(10000),
    description: z.string().trim().max(300).optional().or(z.literal("")),
    statut: z.enum(["actif", "inactif"]).optional(),
    vedette: z.boolean().optional(),
  })
  .strict();

/** Enregistrement d'un paiement d'abonnement par le super-admin. */
export const paiementAbonnementSchema = z
  .object({
    entrepriseId: z.string().min(1).max(40),
    planCode: z.string().trim().toUpperCase().min(2).max(20),
    montant: z.number().min(0).max(100_000_000),
    mois: z.number().int().min(1).max(36),
    modePaiement: z.string().trim().min(2).max(40),
    reference: z.string().trim().max(80).optional().or(z.literal("")),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .strict();
