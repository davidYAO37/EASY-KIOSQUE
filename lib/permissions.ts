/**
 * Système de permissions EASY-KIOSQUE.
 *
 * Même principe que NOVASYS :
 * - le champ `type` (rôle) détermine les services accessibles par défaut ;
 * - un admin peut personnaliser, par utilisateur, les services et actions ;
 * - `admin` (entreprise) et `adminsuper` (plateforme) gardent un accès
 *   complet ("*" = tout).
 *
 * Profils EASY-KIOSQUE : Administrateur entreprise, Gestionnaire,
 * Responsable kiosque, Caissier, Comptable (+ Super Admin plateforme).
 */

export type ServiceCode =
  | "accueil"
  | "kiosques"
  | "ventes"
  | "produits"
  | "clients"
  | "credits"
  | "caisse"
  | "depenses"
  | "rapports"
  | "utilisateurs"
  | "parametres"
  | "plateforme";

export const ALL_SERVICE_CODES: ServiceCode[] = [
  "accueil",
  "kiosques",
  "ventes",
  "produits",
  "clients",
  "credits",
  "caisse",
  "depenses",
  "rapports",
  "utilisateurs",
  "parametres",
  "plateforme",
];

/** Services visibles pour une entreprise cliente (hors admin plateforme). */
export const TENANT_SERVICE_CODES: ServiceCode[] = ALL_SERVICE_CODES.filter(
  (s) => s !== "plateforme"
);

export interface StoredPermissions {
  services?: string[];
  actions?: string[];
  customized?: boolean;
}

export interface ResolvedPermissions {
  services: ServiceCode[];
  actions: string[];
  customized: boolean;
}

/** Catalogue des actions sensibles attribuables individuellement. */
export const PERMISSION_ACTIONS = [
  {
    code: "enregistrer_vente",
    label: "Enregistrer une vente",
    modules: ["ventes", "caisse"],
  },
  {
    code: "vente_credit",
    label: "Enregistrer une vente à crédit",
    modules: ["ventes", "credits"],
  },
  {
    code: "modifier_vente",
    label: "Modifier une vente non validée",
    modules: ["ventes"],
  },
  {
    code: "annuler_vente",
    label: "Annuler une vente validée",
    modules: ["ventes"],
  },
  {
    code: "accorder_remise",
    label: "Accorder une remise sur une vente (V2 — désactivé en V1)",
    modules: ["ventes"],
  },
  {
    code: "declarer_remise",
    label: "Déclarer une remise d'argent",
    modules: ["caisse"],
  },
  {
    code: "confirmer_remise",
    label: "Confirmer une remise d'argent",
    modules: ["caisse"],
  },
  {
    code: "enregistrer_depense",
    label: "Enregistrer une dépense",
    modules: ["depenses"],
  },
  {
    code: "annuler_depense",
    label: "Annuler une dépense",
    modules: ["depenses"],
  },
  {
    code: "ouvrir_caisse",
    label: "Ouvrir une caisse",
    modules: ["caisse"],
  },
  {
    code: "cloturer_caisse",
    label: "Clôturer une caisse",
    modules: ["caisse"],
  },
  {
    code: "consulter_credits",
    label: "Consulter les crédits clients",
    modules: ["credits", "clients"],
  },
  {
    code: "enregistrer_remboursement",
    label: "Enregistrer un remboursement de créance",
    modules: ["credits", "caisse"],
  },
  {
    code: "consulter_rapports",
    label: "Consulter les rapports",
    modules: ["rapports"],
  },
  {
    code: "export_donnees",
    label: "Exports Excel / impressions",
    modules: ["rapports"],
  },
  {
    code: "gerer_produits",
    label: "Gérer les produits et catégories",
    modules: ["produits"],
  },
  {
    code: "gerer_kiosques",
    label: "Créer et modifier les kiosques",
    modules: ["kiosques"],
  },
  {
    code: "gestion_utilisateurs",
    label: "Gérer les utilisateurs et profils",
    modules: ["utilisateurs"],
  },
  {
    code: "parametrage_general",
    label: "Paramétrages divers (entreprise, impression...)",
    modules: ["parametres"],
  },
] as const;

export type PermissionActionCode = (typeof PERMISSION_ACTIONS)[number]["code"];

export const ALL_ACTION_CODES: string[] = PERMISSION_ACTIONS.map((a) => a.code);

/** Services accessibles par défaut selon le rôle. */
export const ROLE_SERVICES: Record<string, ServiceCode[]> = {
  adminsuper: [...ALL_SERVICE_CODES],
  admin: [...TENANT_SERVICE_CODES],
  gestionnaire: [
    "accueil",
    "kiosques",
    "ventes",
    "produits",
    "clients",
    "credits",
    "caisse",
    "depenses",
    "rapports",
    "parametres",
  ],
  responsable: [
    "accueil",
    "ventes",
    "produits",
    "clients",
    "credits",
    "caisse",
    "depenses",
    "rapports",
  ],
  caissier: ["accueil", "ventes", "clients", "caisse"],
  vendeur: ["accueil", "ventes", "clients", "caisse"],
  comptable: ["accueil", "clients", "credits", "caisse", "depenses", "rapports"],
};

/** Actions accordées par défaut à chaque rôle (hors personnalisation). */
export const ROLE_ACTIONS: Record<string, string[]> = {
  adminsuper: ["*"],
  admin: ["*"],
  gestionnaire: [
    "enregistrer_vente",
    "vente_credit",
    "modifier_vente",
    "annuler_vente",
    "enregistrer_depense",
    "annuler_depense",
    "ouvrir_caisse",
    "cloturer_caisse",
    "consulter_credits",
    "enregistrer_remboursement",
    "declarer_remise",
    "confirmer_remise",
    "consulter_rapports",
    "export_donnees",
    "gerer_produits",
    "gerer_kiosques",
    "parametrage_general",
  ],
  responsable: [
    "enregistrer_vente",
    "vente_credit",
    "modifier_vente",
    "enregistrer_depense",
    "ouvrir_caisse",
    "cloturer_caisse",
    "consulter_credits",
    "enregistrer_remboursement",
    "declarer_remise",
    "confirmer_remise",
    "consulter_rapports",
  ],
  caissier: [
    "enregistrer_vente",
    "vente_credit",
    "ouvrir_caisse",
    "cloturer_caisse",
    "consulter_credits",
    "enregistrer_remboursement",
    "declarer_remise",
  ],
  // Vendeur : exécution uniquement — vend au tarif officiel, consulte ses
  // ventes du jour, fait son point journalier et déclare sa remise.
  // Aucune modification de vente validée, prix, produit ou dépense.
  vendeur: ["enregistrer_vente", "ouvrir_caisse", "declarer_remise"],
  comptable: [
    "enregistrer_depense",
    "annuler_depense",
    "cloturer_caisse",
    "consulter_credits",
    "enregistrer_remboursement",
    "consulter_rapports",
    "export_donnees",
  ],
};

/** Libellés d'affichage des rôles (valeurs stockées en base = clés). */
export const ROLE_LABELS: Record<string, string> = {
  adminsuper: "Super Administrateur (plateforme)",
  admin: "Administrateur",
  gestionnaire: "Gestionnaire",
  responsable: "Responsable kiosque",
  caissier: "Caissier",
  vendeur: "Vendeur",
  comptable: "Comptable",
};

/** Rôles attribuables dans une entreprise (adminsuper = réservé plateforme). */
export const TENANT_ROLES = Object.keys(ROLE_LABELS).filter(
  (r) => r !== "adminsuper"
);

/** Page d'accueil par service, pour la redirection après connexion. */
export const SERVICE_HOME: Record<string, string> = {
  accueil: "/dashboard",
  kiosques: "/dashboard/kiosques",
  ventes: "/dashboard/ventes",
  produits: "/dashboard/produits",
  clients: "/dashboard/clients",
  credits: "/dashboard/credits",
  caisse: "/dashboard/caisse",
  depenses: "/dashboard/depenses",
  rapports: "/dashboard/rapports",
  utilisateurs: "/dashboard/utilisateurs",
  parametres: "/dashboard/parametres/entreprise",
  plateforme: "/dashboard/admin/entreprises",
};

/** Page d'accueil par rôle. */
export const ROLE_HOME: Record<string, string> = {
  adminsuper: "/dashboard/admin/entreprises",
  admin: "/dashboard",
  gestionnaire: "/dashboard",
  responsable: "/dashboard/ventes",
  caissier: "/dashboard/ventes",
  vendeur: "/dashboard/ventes",
  comptable: "/dashboard/caisse",
};

interface UserLike {
  type?: string;
  permissions?: StoredPermissions;
}

/** Résout les permissions effectives d'un utilisateur (document ou lean). */
export function getUserPermissions(user: UserLike): ResolvedPermissions {
  const type = user?.type || "caissier";
  const stored = user?.permissions;

  if (stored?.customized) {
    return {
      services: (stored.services || []) as ServiceCode[],
      actions: stored.actions || [],
      customized: true,
    };
  }

  return {
    services: ROLE_SERVICES[type] || ["accueil"],
    actions: ROLE_ACTIONS[type] || [],
    customized: false,
  };
}

/**
 * Valide/normalise le rôle et les permissions envoyés pour un profil
 * (POST/PUT `/api/profils`). Rôle inconnu → "caissier" ;
 * services/actions filtrés contre les catalogues.
 */
export function lireDroitsProfil(data: {
  type?: string;
  customized?: boolean;
  services?: string[];
  actions?: string[];
}) {
  // adminsuper n'est jamais attribuable via un profil (réservé plateforme)
  const type =
    data.type && data.type !== "adminsuper" && ROLE_LABELS[data.type]
      ? data.type
      : "caissier";
  const customized = !!data.customized;
  return {
    type,
    customized,
    services: customized
      ? (data.services || []).filter((s) =>
          ALL_SERVICE_CODES.includes(s as ServiceCode)
        )
      : [],
    actions: customized
      ? (data.actions || []).filter((a) => ALL_ACTION_CODES.includes(a))
      : [],
  };
}

/** L'utilisateur possède-t-il l'action demandée ? */
export function hasActionPermission(user: UserLike, action: string): boolean {
  const perms = getUserPermissions(user);
  return perms.actions.includes("*") || perms.actions.includes(action);
}

/**
 * Repli : un utilisateur personnalisé dont les services couvrent tous ceux
 * d'un rôle autorisé est considéré comme ayant ce rôle.
 * Les rôles admin/adminsuper ne peuvent JAMAIS être imités.
 */
export function matchesAllowedRoles(
  user: UserLike,
  allowedRoles?: string[]
): boolean {
  if (!allowedRoles?.length || !user?.permissions?.customized) return false;
  const userServices = new Set(user.permissions.services || []);
  return allowedRoles.some(
    (role) =>
      role !== "admin" &&
      role !== "adminsuper" &&
      (ROLE_SERVICES[role] || []).every((s) => userServices.has(s))
  );
}
