'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Modal, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { fmtDate, STATUTS_KIOSQUE } from '@/lib/format';

interface Kiosque {
  _id: string;
  code: string;
  designation: string;
  adresse?: string;
  telephone?: string;
  responsable?: string;
  dateOuverture?: string;
  statut?: string;
}

const VIDE = { code: '', designation: '', adresse: '', telephone: '', responsable: '' };

function KiosquesInner() {
  const [kiosques, setKiosques] = useState<Kiosque[]>([]);
  const [chargement, setChargement] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [edition, setEdition] = useState<Kiosque | null>(null);
  const [form, setForm] = useState(VIDE);
  const [saving, setSaving] = useState(false);
  const [peutGerer, setPeutGerer] = useState(false);

  const charger = useCallback(() => {
    setChargement(true);
    axios
      .get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => toast.error('Erreur de chargement des kiosques'))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    charger();
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const u = data?.user;
        setPeutGerer(
          !!u &&
            (u.type === 'admin' ||
              u.type === 'gestionnaire' ||
              u.permissions?.actions?.includes('*') ||
              u.permissions?.actions?.includes('gerer_kiosques'))
        );
      })
      .catch(() => {});
  }, [charger]);

  const ouvrir = (k?: Kiosque) => {
    setEdition(k || null);
    setForm(
      k
        ? {
            code: k.code || '',
            designation: k.designation || '',
            adresse: k.adresse || '',
            telephone: k.telephone || '',
            responsable: k.responsable || '',
          }
        : VIDE
    );
    setShowModal(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (edition) {
        await axios.put(`/api/kiosques/${edition._id}`, form, { withCredentials: true });
        toast.success('Kiosque modifié');
      } else {
        await axios.post('/api/kiosques', form, { withCredentials: true });
        toast.success('Kiosque créé');
      }
      setShowModal(false);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const basculerStatut = async (k: Kiosque) => {
    const statut = k.statut === 'actif' ? 'inactif' : 'actif';
    try {
      await axios.put(`/api/kiosques/${k._id}`, { statut }, { withCredentials: true });
      toast.success(`Kiosque ${statut === 'actif' ? 'activé' : 'désactivé'}`);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const supprimer = async (k: Kiosque) => {
    if (!confirm(`Désactiver le kiosque « ${k.designation} » ?`)) return;
    try {
      await axios.delete(`/api/kiosques/${k._id}`, { withCredentials: true });
      toast.success('Kiosque désactivé');
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Mes kiosques</h3>
        {peutGerer && (
          <Button variant="primary" onClick={() => ouvrir()}>
            <i className="bi bi-plus-lg me-2"></i>Nouveau kiosque
          </Button>
        )}
      </div>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Code</th>
                <th>Désignation</th>
                <th>Adresse</th>
                <th>Téléphone</th>
                <th>Responsable</th>
                <th>Ouverture</th>
                <th>Statut</th>
                {peutGerer && <th className="text-end">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={8} className="text-center p-4">Chargement...</td></tr>
              ) : kiosques.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-4 text-muted">
                    Aucun kiosque — cliquez sur « Nouveau kiosque » pour commencer.
                  </td>
                </tr>
              ) : (
                kiosques.map((k) => {
                  const st = STATUTS_KIOSQUE[k.statut || 'actif'];
                  return (
                    <tr key={k._id}>
                      <td className="fw-semibold">{k.code}</td>
                      <td>{k.designation}</td>
                      <td>{k.adresse || '—'}</td>
                      <td>{k.telephone || '—'}</td>
                      <td>{k.responsable || '—'}</td>
                      <td>{fmtDate(k.dateOuverture)}</td>
                      <td><Badge bg={st.color}>{st.label}</Badge></td>
                      {peutGerer && (
                        <td className="text-end">
                          <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrir(k)}>
                            <i className="bi bi-pencil"></i>
                          </Button>
                          <Button
                            size="sm"
                            variant={k.statut === 'actif' ? 'outline-warning' : 'outline-success'}
                            className="me-1"
                            title={k.statut === 'actif' ? 'Désactiver' : 'Activer'}
                            onClick={() => basculerStatut(k)}
                          >
                            <i className={`bi ${k.statut === 'actif' ? 'bi-pause-circle' : 'bi-play-circle'}`}></i>
                          </Button>
                          <Button size="sm" variant="outline-danger" onClick={() => supprimer(k)}>
                            <i className="bi bi-trash"></i>
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>{edition ? 'Modifier le kiosque' : 'Nouveau kiosque'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Code kiosque</Form.Label>
              <Form.Control
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="Laisser vide pour génération automatique (K001...)"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Désignation *</Form.Label>
              <Form.Control
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Adresse</Form.Label>
              <Form.Control
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
              />
            </Form.Group>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Téléphone</Form.Label>
                  <Form.Control
                    value={form.telephone}
                    onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Responsable</Form.Label>
                  <Form.Control
                    value={form.responsable}
                    onChange={(e) => setForm({ ...form, responsable: e.target.value })}
                  />
                </Form.Group>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default function KiosquesPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable']} allowedActions={['gerer_kiosques']}>
      <KiosquesInner />
    </RoleGuard>
  );
}
