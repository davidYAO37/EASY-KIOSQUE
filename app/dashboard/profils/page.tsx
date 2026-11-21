'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Modal, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import PermissionsModal, { type PermissionsValue } from '@/components/PermissionsModal';
import { ROLE_LABELS, TENANT_ROLES } from '@/lib/permissions';

interface Profil {
  _id: string;
  profil: string;
  type?: string;
  customized?: boolean;
  services?: string[];
  actions?: string[];
}

function ProfilsInner() {
  const [profils, setProfils] = useState<Profil[]>([]);
  const [chargement, setChargement] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [edition, setEdition] = useState<Profil | null>(null);
  const [nom, setNom] = useState('');
  const [type, setType] = useState('caissier');
  const [perms, setPerms] = useState<PermissionsValue>({ customized: false, services: [], actions: [] });
  const [saving, setSaving] = useState(false);

  const charger = useCallback(() => {
    setChargement(true);
    axios
      .get('/api/profils', { withCredentials: true })
      .then((res) => setProfils(res.data?.profils || []))
      .catch(() => toast.error('Erreur de chargement des profils'))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const ouvrir = (p?: Profil) => {
    setEdition(p || null);
    setNom(p?.profil || '');
    setType(p?.type || 'caissier');
    setPerms({
      customized: !!p?.customized,
      services: p?.services || [],
      actions: p?.actions || [],
    });
    setShowModal(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { profil: nom, type, ...perms };
      if (edition) {
        await axios.put(`/api/profils/${edition._id}`, payload, { withCredentials: true });
        toast.success('Profil modifié');
      } else {
        await axios.post('/api/profils', payload, { withCredentials: true });
        toast.success('Profil créé');
      }
      setShowModal(false);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async (p: Profil) => {
    if (!confirm(`Supprimer le profil « ${p.profil} » ?`)) return;
    try {
      await axios.delete(`/api/profils/${p._id}`, { withCredentials: true });
      toast.success('Profil supprimé');
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Profils de droits</h3>
        <Button variant="primary" onClick={() => ouvrir()}>
          <i className="bi bi-plus-lg me-2"></i>Nouveau profil
        </Button>
      </div>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Profil</th>
                <th>Rôle de base</th>
                <th>Permissions</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={4} className="text-center p-4">Chargement...</td></tr>
              ) : profils.length === 0 ? (
                <tr><td colSpan={4} className="text-center p-4 text-muted">Aucun profil.</td></tr>
              ) : (
                profils.map((p) => (
                  <tr key={p._id}>
                    <td className="fw-semibold">{p.profil}</td>
                    <td><Badge bg="primary">{ROLE_LABELS[p.type || ''] || p.type}</Badge></td>
                    <td>
                      {p.customized
                        ? <Badge bg="info" text="dark">Personnalisées ({p.services?.length || 0} services, {p.actions?.length || 0} actions)</Badge>
                        : <span className="text-muted">Droits par défaut du rôle</span>}
                    </td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrir(p)}>
                        <i className="bi bi-pencil"></i>
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => supprimer(p)}>
                        <i className="bi bi-trash"></i>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>{edition ? 'Modifier le profil' : 'Nouveau profil'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Nom du profil *</Form.Label>
              <Form.Control value={nom} onChange={(e) => setNom(e.target.value)} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Rôle de base</Form.Label>
              <Form.Select value={type} onChange={(e) => setType(e.target.value)}>
                {TENANT_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Button variant="outline-primary" size="sm" type="button" onClick={() => setShowPerms(true)}>
              <i className="bi bi-shield-lock me-1"></i>
              Permissions personnalisées
              {perms.customized && <Badge bg="primary" className="ms-2">actives</Badge>}
            </Button>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <PermissionsModal show={showPerms} value={perms} onChange={setPerms} onClose={() => setShowPerms(false)} />
    </div>
  );
}

export default function ProfilsPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire']} allowedActions={['gestion_utilisateurs']}>
      <ProfilsInner />
    </RoleGuard>
  );
}
