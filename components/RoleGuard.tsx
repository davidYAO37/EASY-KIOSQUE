"use client";

import { useEffect } from "react";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useRouter } from "next/navigation";
import { ROLE_HOME, SERVICE_HOME, matchesAllowedRoles } from "@/lib/permissions";

interface RoleGuardProps {
  /** Types d'utilisateur autorisés pour cette section (en plus de "admin"/"adminsuper", toujours autorisés). */
  allowedRoles: string[];
  /** Actions dont au moins une doit être possédée pour accéder à la section. */
  allowedActions?: string[];
  /**
   * Mode strict : SEULS les rôles listés passent — les auto-autorisations
   * admin/adminsuper sont désactivées (ex. pages réservées à la plateforme).
   */
  strict?: boolean;
  children: React.ReactNode;
}

/**
 * Vérifie que l'utilisateur connecté a le bon rôle pour accéder à cette
 * section de l'application. `Verifconnecion` vérifie uniquement
 * l'authentification, pas le rôle.
 */
export default function RoleGuard({ allowedRoles, allowedActions, strict, children }: RoleGuardProps) {
  const { user, loading } = useAuthUser();
  const type = user?.type;
  const userServices = user?.permissions?.services || [];
  const userActions = user?.permissions?.actions || [];
  const allowed = !!type && (strict ? allowedRoles.includes(type) :
    type === 'adminsuper' || type === 'admin' || allowedRoles.includes(type) ||
    matchesAllowedRoles({ type, permissions: { services: userServices, customized: true } }, allowedRoles) ||
    (!!allowedActions?.length && (userActions.includes('*') || allowedActions.some((a) => userActions.includes(a)))));
  const status = loading ? 'loading' : allowed ? 'allowed' : 'denied';
  const router = useRouter();

  useEffect(() => {
    if (status !== 'denied') return;
    const home = (type && ROLE_HOME[type]) || (userServices[0] && SERVICE_HOME[userServices[0]]) || '/connexion';
    const timer = setTimeout(() => router.replace(home), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, type, router]);

  if (status === "loading") {
    return <div className="text-center p-5">Chargement...</div>;
  }

  if (status === "denied") {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "60vh" }}>
        <div className="alert alert-danger text-center">
          <strong>Accès non autorisé</strong>
          <div>Vous n&apos;avez pas le rôle requis pour accéder à cette section. Redirection...</div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
