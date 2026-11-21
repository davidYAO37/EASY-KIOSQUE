"use client";

import { Modal, Button, Form } from "react-bootstrap";
import {
  ALL_SERVICE_CODES,
  PERMISSION_ACTIONS,
  type ServiceCode,
} from "@/lib/permissions";

const SERVICE_LABELS: Record<ServiceCode, string> = {
  accueil: "Tableau de bord",
  kiosques: "Mes kiosques",
  ventes: "Ventes (POS)",
  produits: "Produits et catégories",
  clients: "Clients",
  credits: "Crédits clients",
  caisse: "Gestion des caisses",
  depenses: "Dépenses",
  rapports: "Rapports",
  utilisateurs: "Utilisateurs et profils",
  parametres: "Paramètres",
  plateforme: "Plateforme (réservé)",
};

export interface PermissionsValue {
  customized: boolean;
  services: string[];
  actions: string[];
}

interface Props {
  show: boolean;
  value: PermissionsValue;
  onChange: (v: PermissionsValue) => void;
  onClose: () => void;
  /** Masque le service « plateforme » (réservé au super-admin). */
  sansPlateforme?: boolean;
}

/**
 * Modale de personnalisation des droits : services accessibles
 * (menu) + actions sensibles, comme dans NOVASYS.
 */
export default function PermissionsModal({ show, value, onChange, onClose, sansPlateforme = true }: Props) {
  const services = ALL_SERVICE_CODES.filter(
    (s) => !sansPlateforme || s !== "plateforme"
  );

  const toggleService = (code: string) => {
    const services = value.services.includes(code)
      ? value.services.filter((s) => s !== code)
      : [...value.services, code];
    onChange({ ...value, services });
  };

  const toggleAction = (code: string) => {
    const actions = value.actions.includes(code)
      ? value.actions.filter((a) => a !== code)
      : [...value.actions, code];
    onChange({ ...value, actions });
  };

  return (
    <Modal show={show} onHide={onClose} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Permissions personnalisées</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Check
          type="switch"
          id="customized"
          label="Personnaliser les droits (sinon : droits par défaut du rôle)"
          checked={value.customized}
          onChange={(e) => onChange({ ...value, customized: e.target.checked })}
          className="mb-3"
        />

        {value.customized && (
          <div className="row">
            <div className="col-md-6">
              <h6 className="text-muted text-uppercase" style={{ fontSize: "0.75rem" }}>
                Services accessibles
              </h6>
              {services.map((s) => (
                <Form.Check
                  key={s}
                  id={`svc-${s}`}
                  label={SERVICE_LABELS[s]}
                  checked={value.services.includes(s)}
                  onChange={() => toggleService(s)}
                />
              ))}
            </div>
            <div className="col-md-6">
              <h6 className="text-muted text-uppercase" style={{ fontSize: "0.75rem" }}>
                Actions sensibles
              </h6>
              {PERMISSION_ACTIONS.map((a) => (
                <Form.Check
                  key={a.code}
                  id={`act-${a.code}`}
                  label={a.label}
                  checked={value.actions.includes(a.code)}
                  onChange={() => toggleAction(a.code)}
                />
              ))}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          Valider
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
