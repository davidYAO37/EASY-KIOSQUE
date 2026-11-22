'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, InputGroup, Modal, Pagination, Row, Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useLecture } from '@/hooks/useLecture';
import RoleGuard from '@/components/RoleGuard';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant } from '@/lib/format';
import type { ClientDTO } from '@/types/ventes';

interface FormClient {
  nom: string; prenoms: string; telephone: string;
  adresse: string; plafondCredit: string;
}
const VIDE: FormClient = { nom: '', prenoms: '', telephone: '', adresse: '', plafondCredit: '' };

/**
 * Fiches clients — obligatoires pour les ventes à crédit.
 * Tout utilisateur peut créer une fiche (POS) ; modification/désactivation
 * réservées aux gestionnaires (admin/gestionnaire/comptable).
 */
function ClientsInner() {
  const { user } = useAuthUser();
  const lire = useLecture();
  const gestionnaire = ['admin', 'gestionnaire', 'comptable'].includes(user?.type || '');

  const [data, setData] = useState<{ clients: ClientDTO[]; total: number; page: number; pages: number }>({
    clients: [], total: 0, page: 1, pages: 1,
  });
  const [chargement, setChargement] = useState(true);
  const [q, setQ] = useState('');
  const [qRecherche, setQRecherche] = useState('');
  const [statut, setStatut] = useState('');
  const [page, setPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [edition, setEdition] = useState<ClientDTO | null>(null);
  const [form, setForm] = useState(VIDE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setQRecherche(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (qRecherche) params.set('q', qRecherche);
    if (statut) params.set('statut', statut);
    void lire(`/api/clients?${params}`, setData,
      () => toast.error('Erreur de chargement des clients'), () => setChargement(false));
  }, [page, qRecherche, statut, lire]);

  useEffect(() => { charger(); }, [charger]);

  const ouvrirCreation = () => { setEdition(null); setForm(VIDE); setShowModal(true); };
  const ouvrirEdition = (c: ClientDTO) => {
    setEdition(c);
    setForm({
      nom: c.nom, prenoms: c.prenoms || '', telephone: c.telephone || '',
      adresse: c.adresse || '', plafondCredit: c.plafondCredit != null ? String(c.plafondCredit) : '',
    });
    setShowModal(true);
  };

  const enregistrer = async () => {
    if (!form.nom.trim()) return toast.warning('Le nom du client est requis.');
    setSaving(true);
    try {
      const body: any = {
        nom: form.nom.trim(),
        prenoms: form.prenoms.trim(),
        telephone: form.telephone.trim(),
        adresse: form.adresse.trim(),
        plafondCredit: form.plafondCredit !== '' ? Number(form.plafondCredit) : null,
      };
      if (edition) {
        await axios.put(`/api/clients/${edition._id}`, body, { withCredentials: true });
        toast.success('Client modifié');
      } else {
        await axios.post('/api/clients', body, { withCredentials: true });
        toast.success('Client créé');
      }
      setShowModal(false);
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const desactiver = async (c: ClientDTO) => {
    try {
      await axios.delete(`/api/clients/${c._id}`, { withCredentials: true });
      toast.success('Client désactivé');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    }
  };

  const reactiver = async (c: ClientDTO) => {
    try {
      await axios.put(`/api/clients/${c._id}`, { statut: 'actif' }, { withCredentials: true });
      toast.success('Client réactivé');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    }
  };

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'caissier', 'vendeur', 'comptable']}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0"><i className="bi bi-people me-2"></i>Clients</h4>
        <Button size="sm" variant="success" onClick={ouvrirCreation}>
          <i className="bi bi-person-plus me-1"></i>Nouveau client
        </Button>
      </div>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2">
            <Col md={6}>
              <InputGroup size="sm">
                <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
                <Form.Control placeholder="Nom, code, téléphone…" value={q} onChange={(e) => setQ(e.target.value)} />
              </InputGroup>
            </Col>
            <Col md={3}>
              <Form.Select size="sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
                <option value="">Tous statuts</option>
                <option value="actif">Actifs</option>
                <option value="inactif">Inactifs</option>
              </Form.Select>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <div className="table-responsive">
          <Table hover size="sm" className="mb-0 align-middle" aria-busy={chargement}>
            {chargement && <caption className="caption-top small">Actualisation…</caption>}
            <thead>
              <tr>
                <th>Code</th><th>Nom</th><th>Téléphone</th><th>Adresse</th>
                <th className="text-end">Plafond crédit</th><th className="text-end">Solde dû</th>
                <th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {chargement && data.clients.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
              ) : data.clients.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted py-4">Aucun client</td></tr>
              ) : (
                data.clients.map((c) => (
                  <tr key={c._id} className={c.statut === 'inactif' ? 'text-muted' : ''}>
                    <td className="fw-semibold">{c.code}</td>
                    <td>{c.nom} {c.prenoms || ''}</td>
                    <td>{c.telephone || '—'}</td>
                    <td className="text-truncate" style={{ maxWidth: 160 }}>{c.adresse || '—'}</td>
                    <td className="text-end">{c.plafondCredit != null ? fmtMontant(c.plafondCredit) : '—'}</td>
                    <td className="text-end">
                      {(c.soldeDu || 0) > 0
                        ? <Badge bg="danger">{fmtMontant(c.soldeDu)} F</Badge>
                        : <span className="text-muted">0</span>}
                    </td>
                    <td><Badge bg={c.statut === 'actif' ? 'success' : 'secondary'}>{c.statut}</Badge></td>
                    <td className="text-nowrap">
                      {gestionnaire && (
                        <>
                          <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrirEdition(c)}>
                            <i className="bi bi-pencil"></i>
                          </Button>
                          {c.statut === 'actif' ? (
                            <Button size="sm" variant="outline-danger" onClick={() => desactiver(c)}>
                              <i className="bi bi-slash-circle"></i>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline-success" onClick={() => reactiver(c)}>
                              <i className="bi bi-arrow-counterclockwise"></i>
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
        {data.pages > 1 && (
          <Card.Footer>
            <Pagination size="sm" className="mb-0 justify-content-center">
              <Pagination.Prev disabled={page <= 1} onClick={() => setPage(page - 1)} />
              <Pagination.Item disabled>{page} / {data.pages}</Pagination.Item>
              <Pagination.Next disabled={page >= data.pages} onClick={() => setPage(page + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{edition ? 'Modifier le client' : 'Nouveau client'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row className="g-2">
            <Col md={6}>
              <Form.Label className="small">Nom *</Form.Label>
              <Form.Control size="sm" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
            </Col>
            <Col md={6}>
              <Form.Label className="small">Prénoms</Form.Label>
              <Form.Control size="sm" value={form.prenoms} onChange={(e) => setForm({ ...form, prenoms: e.target.value })} />
            </Col>
            <Col md={6}>
              <Form.Label className="small">Téléphone</Form.Label>
              <Form.Control size="sm" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
            </Col>
            <Col md={6}>
              <Form.Label className="small">Plafond de crédit (FCFA)</Form.Label>
              <Form.Control size="sm" type="number" min={0} value={form.plafondCredit}
                onChange={(e) => setForm({ ...form, plafondCredit: e.target.value })} />
            </Col>
            <Col md={12}>
              <Form.Label className="small">Adresse</Form.Label>
              <Form.Control size="sm" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Annuler</Button>
          <Button variant="primary" size="sm" disabled={saving} onClick={enregistrer}>
            {edition ? 'Enregistrer' : 'Créer'}
          </Button>
        </Modal.Footer>
      </Modal>
    </RoleGuard>
  );
}

export default function PageClients() {
  return <ClientsInner />;
}
