"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthUser } from "@/hooks/useAuthUser";
import { Badge, Nav, Offcanvas } from "react-bootstrap";

interface MenuItem {
  label: string;
  href: string;
  icon: string;
  service: string;
}

interface Notifs {
  nonLues: number;
}

/**
 * Menu latéral EASY-KIOSQUE — reprend les rubriques du cahier des charges :
 * Tableau de bord, Mes kiosques, Ventes, Produits, Catégories, Clients,
 * Crédits clients, Gestion des caisses, Dépenses, Rapports, Utilisateurs,
 * Paramètres (+ section Plateforme pour le super-admin).
 */
const MENU: { title?: string; items: MenuItem[] }[] = [
  {
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: "bi-speedometer2", service: "accueil" },
    ],
  },
  {
    title: "Exploitation",
    items: [
      { label: "Ventes", href: "/dashboard/ventes", icon: "bi-cart3", service: "ventes" },
      { label: "Gestion des caisses", href: "/dashboard/caisse", icon: "bi-cash-stack", service: "caisse" },
      { label: "Dépenses", href: "/dashboard/depenses", icon: "bi-wallet", service: "depenses" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Produits", href: "/dashboard/produits", icon: "bi-box-seam", service: "produits" },
      { label: "Catégories", href: "/dashboard/categories", icon: "bi-tags", service: "produits" },
    ],
  },
  {
    title: "Tiers",
    items: [
      { label: "Clients", href: "/dashboard/clients", icon: "bi-people", service: "clients" },
      { label: "Crédits clients", href: "/dashboard/credits", icon: "bi-credit-card", service: "credits" },
    ],
  },
  {
    title: "Analyse",
    items: [
      { label: "Notifications", href: "/dashboard/notifications", icon: "bi-bell", service: "notifications" },
      { label: "Rapports", href: "/dashboard/rapports", icon: "bi-graph-up", service: "rapports" },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Mes kiosques", href: "/dashboard/kiosques", icon: "bi-shop", service: "kiosques" },
      { label: "Utilisateurs", href: "/dashboard/utilisateurs", icon: "bi-person-badge", service: "utilisateurs" },
      { label: "Profils", href: "/dashboard/profils", icon: "bi-shield-lock", service: "utilisateurs" },
      { label: "Journal d'activité", href: "/dashboard/journal", icon: "bi-journal-text", service: "parametres" },
      { label: "Paramètres", href: "/dashboard/parametres/entreprise", icon: "bi-gear", service: "parametres" },
    ],
  },
  {
    title: "Plateforme",
    items: [
      { label: "Entreprises", href: "/dashboard/admin/entreprises", icon: "bi-buildings", service: "plateforme" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, effacer, nonLues, actualiserNotifications } = useAuthUser();
  const [services, setServices] = useState<string[] | null>(null);
  const [userName, setUserName] = useState("");
  const [userType, setUserType] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const notifs = { nonLues };

  useEffect(() => {
    {
        const u = user;
        if (u) {
          setUserName(`${u.nom || ""} ${u.prenom || ""}`.trim());
          setUserType(u.type || "");
          if (u.type === "adminsuper") {
            // Super-admin plateforme : uniquement la gestion des entreprises,
            // jamais les menus métier (leurs API exigent une entreprise).
            setServices(["plateforme"]);
          } else if (u.type === "admin") {
            setServices(["*"]);
          } else {
            setServices(u.permissions?.services || []);
          }
        }
      }
  }, [user]);

  // L'offcanvas se ferme automatiquement après navigation
  useEffect(() => { setShowMenu(false); }, [pathname]);

  // Badge de notifications non lues (propriétaire/gestionnaire seulement —
  // ni super-admin ni opérateurs : pas d'appel voué au 403),
  // rechargé à chaque changement de page
  useEffect(() => {
    if (userType !== "admin" && userType !== "gestionnaire") return;
    actualiserNotifications();
  }, [pathname, userType, actualiserNotifications]);

  const isVisible = (service: string) => {
    if (service === "notifications") {
      // Centre de notifications réservé au propriétaire et à ses gestionnaires
      return userType === "admin" || userType === "gestionnaire";
    }
    return services === null || services.includes("*") || services.includes(service);
  };

  // Lien actif = href le plus long préfixe du pathname
  const hrefActif = useMemo(() => {
    let meilleur: string | null = null;
    for (const section of MENU) {
      for (const item of section.items) {
        const exact = item.href === "/dashboard"
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        if (exact && (meilleur === null || item.href.length > meilleur.length)) {
          meilleur = item.href;
        }
      }
    }
    return meilleur;
  }, [pathname]);

  // Badge de notification associé à une entrée de menu
  const badgePour = (href: string): { bg: string; text?: string; texte: string; title: string } | null => {
    if (!notifs) return null;
    if (href === "/dashboard/notifications") {
      return notifs.nonLues > 0
        ? { bg: "danger", texte: String(notifs.nonLues), title: `${notifs.nonLues} notification(s) non lue(s)` }
        : null;
    }
    return null;
  };

  const handleLogout = async () => {
    if (!window.dispatchEvent(new Event('ek-kiosque-avant-changement', { cancelable: true }))) return;
    try {
      await fetch("/api/logout", { method: "POST", credentials: "include" });
    } finally {
      effacer();
      localStorage.removeItem("profil");
      localStorage.removeItem("nom_utilisateur");
      localStorage.removeItem("ek_kiosque_id");
      router.push("/connexion");
    }
  };

  const contenu = (
    <>
      <div className="mb-3">
        <div className="sidebar-logo-tile">
          <span className="ek-logo">
            <img src="/logo.svg" alt="" width={42} height={42} className="rounded-3" />
            <span className="ek-logo-text">EASY-<strong>KIOSQUE</strong></span>
          </span>
        </div>
        <small className="d-block mt-2" style={{ color: "var(--ek-grey)" }}>
          Gestion multi-kiosques
        </small>
      </div>

      <Nav className="flex-column flex-grow-1">
        {MENU.map((section, i) => {
          const items = section.items.filter((it) => isVisible(it.service));
          if (!items.length) return null;
          return (
            <div key={i}>
              {section.title && <div className="sidebar-title">{section.title}</div>}
              {items.map((item) => {
                const badge = badgePour(item.href);
                return (
                  <Nav.Link
                    key={item.href}
                    as={Link}
                    href={item.href}
                    className={`d-flex align-items-center${hrefActif === item.href ? " active" : ""}`}
                  >
                    <i className={`bi ${item.icon} me-2`}></i>
                    {item.label}
                    {badge && (
                      <Badge pill bg={badge.bg} text={badge.text as any} className="ms-auto" title={badge.title}>
                        {badge.texte}
                      </Badge>
                    )}
                  </Nav.Link>
                );
              })}
            </div>
          );
        })}
      </Nav>

      <div className="border-top border-secondary pt-3 mt-3">
        <div className="small" style={{ color: "var(--ek-grey)" }}>{userType}</div>
        <div className="mb-2 fw-semibold text-white">{userName || "Utilisateur"}</div>
        <button className="btn btn-outline-light btn-sm w-100" onClick={handleLogout}>
          <i className="bi bi-box-arrow-right me-2"></i>Déconnexion
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Barre supérieure — petit écran (< lg) */}
      <div className="topbar-ek d-lg-none sticky-top d-flex align-items-center gap-2 px-2 py-2">
        <button
          className="btn btn-outline-light btn-sm"
          aria-label="Ouvrir le menu"
          onClick={() => setShowMenu(true)}
        >
          <i className="bi bi-list fs-5"></i>
        </button>
        <span className="ek-logo" style={{ fontSize: "0.95rem" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={30} height={30} className="rounded-2" />
          <span className="ek-logo-text text-white">EASY-<strong>KIOSQUE</strong></span>
        </span>
        <span className="ms-auto small text-truncate">{userName}</span>
      </div>

      {/* Menu offcanvas — petit écran */}
      <Offcanvas show={showMenu} onHide={() => setShowMenu(false)} placement="start" className="sidebar-ek">
        <Offcanvas.Body className="d-flex flex-column p-3">
          {contenu}
        </Offcanvas.Body>
      </Offcanvas>

      {/* Menu fixe — grand écran (≥ lg) */}
      <aside
        className="sidebar-ek p-3 d-none d-lg-flex flex-column flex-shrink-0 sticky-top"
        style={{ width: 260, height: "100vh", overflowY: "auto" }}
      >
        {contenu}
      </aside>
    </>
  );
}
