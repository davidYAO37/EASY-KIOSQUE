"use client";

import { useRouter } from "next/navigation";
import { Badge, Dropdown, Form } from "react-bootstrap";
import { useKiosque } from "@/hooks/useKiosque";
import { useAuthUser } from "@/hooks/useAuthUser";
import { fmtMontant } from "@/lib/format";
import type { NotificationDTO } from "@/types/ventes";

interface EntrepriseInfo {
  nomSociete: string;
  nomCommercial?: string;
  devise?: string;
}

/**
 * Cloche de notifications propriétaire — actualisation automatique toutes
 * les 30 s (quasi temps réel). Invisible pour les autres profils.
 */
function ClocheNotifications() {
  const router = useRouter();
  const { notifications: notifs, nonLues, actualiserNotifications } = useAuthUser();

  const toutLire = async () => {
    const res = await fetch("/api/notifications/tout-lire", {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) actualiserNotifications();
  };

  const ouvrir = async (n: NotificationDTO) => {
    if (!n.lue) {
      try {
        const res = await fetch(`/api/notifications/${n._id}`, { method: 'PATCH', credentials: 'include' });
        if (res.ok) actualiserNotifications();
      } catch {}
    }
    router.push("/dashboard/notifications");
  };

  return (
    <Dropdown align="end">
      <Dropdown.Toggle variant="outline-secondary" size="sm" id="menu-notifs" className="position-relative">
        <i className="bi bi-bell"></i>
        {nonLues > 0 && (
          <Badge pill bg="danger" className="position-absolute top-0 start-100 translate-middle">
            {nonLues > 99 ? "99+" : nonLues}
          </Badge>
        )}
      </Dropdown.Toggle>
      <Dropdown.Menu style={{ minWidth: 330, maxHeight: 420, overflowY: "auto" }}>
        <div className="d-flex justify-content-between align-items-center px-3 py-1">
          <strong>Notifications</strong>
          {nonLues > 0 && (
            <button className="btn btn-link btn-sm p-0" onClick={toutLire}>
              Tout lire
            </button>
          )}
        </div>
        <Dropdown.Divider className="my-1" />
        {notifs.length === 0 && (
          <div className="text-center text-muted small py-3">Aucune notification</div>
        )}
        {notifs.map((n) => (
          <Dropdown.Item key={n._id} onClick={() => ouvrir(n)} className="text-wrap py-2">
            <div className="d-flex gap-2">
              {!n.lue && <span className="text-primary mt-1">●</span>}
              <div className={n.lue ? "text-muted" : ""} style={{ flex: 1 }}>
                <div className="fw-semibold small">{n.titre}</div>
                <div className="small text-wrap">{n.message}</div>
                <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                  {n.createdAt ? new Date(n.createdAt).toLocaleString("fr-FR") : ""}
                  {n.montant ? ` · ${fmtMontant(n.montant)} F` : ""}
                </div>
              </div>
            </div>
          </Dropdown.Item>
        ))}
        <Dropdown.Divider className="my-1" />
        <Dropdown.Item onClick={() => router.push("/dashboard/notifications")} className="text-center small">
          Voir toutes les notifications
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}

/**
 * Barre supérieure du tableau de bord : sélecteur de kiosque,
 * nom de l'utilisateur, menu profil et déconnexion.
 */
export default function Header() {
  const router = useRouter();
  const { kiosqueId, kiosques, changerKiosque } = useKiosque();
  const { user, entreprise, effacer } = useAuthUser();
  const userName = `${user?.nom || ''} ${user?.prenom || ''}`.trim();
  const userType = user?.type || '';
  const isSuper = userType === 'adminsuper';

  // Cloche réservée au propriétaire/gestionnaire d'une entreprise —
  // le super-admin plateforme et les opérateurs ne la voient pas
  // (évite les appels /api/notifications voués au 403).
  const afficherCloche = ["admin", "gestionnaire"].includes(userType);

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

  return (
    <div className="header-ek d-flex align-items-center gap-2 gap-md-3 px-3 py-2 mb-3 rounded">
      <span className="fw-semibold text-truncate" style={{ color: "var(--ek-anthracite)" }}>
        {entreprise?.nomCommercial || entreprise?.nomSociete || "EASY-KIOSQUE"}
      </span>

      {/* Sélecteur de kiosque — masqué pour le super-admin plateforme */}
      {!isSuper && (
        <div className="d-flex align-items-center gap-2 ms-auto">
          <i className="bi bi-shop text-primary d-none d-sm-inline"></i>
          {kiosques.length > 0 ? (
            <Form.Select
              size="sm"
              className="kiosque-select"
              value={kiosqueId}
              onChange={(e) => changerKiosque(e.target.value)}
              aria-label="Kiosque actif"
            >
              <option value="">Tous les kiosques</option>
              {kiosques.map((k) => (
                <option key={k._id} value={k._id}>
                  {k.code} — {k.designation}
                </option>
              ))}
            </Form.Select>
          ) : (
            <span className="badge text-bg-warning">Aucun kiosque</span>
          )}
        </div>
      )}

      {afficherCloche && <ClocheNotifications />}

      <Dropdown align="end" className={isSuper ? "ms-auto" : ""}>
        <Dropdown.Toggle variant="outline-secondary" size="sm" id="menu-profil">
          <i className="bi bi-person-circle me-1"></i>
          <span className="d-none d-md-inline">{userName || "Compte"}</span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={() => router.push("/dashboard/parametres/compte")}>
            <i className="bi bi-person me-2"></i>Mon compte
          </Dropdown.Item>
          {!isSuper && (
            <Dropdown.Item onClick={() => router.push("/dashboard/parametres/entreprise")}>
              <i className="bi bi-gear me-2"></i>Paramètres
            </Dropdown.Item>
          )}
          <Dropdown.Divider />
          <Dropdown.Item onClick={handleLogout} className="text-danger">
            <i className="bi bi-box-arrow-right me-2"></i>Déconnexion
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}
