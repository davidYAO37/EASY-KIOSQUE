'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Modal, Nav, Pagination, Row,
  Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useKiosque } from '@/hooks/useKiosque';
import { fmtMontant, fmtDate } from '@/lib/format';
import type { CategorieDepenseDTO, DepenseDTO } from '@/types/depenses';

interface KiosqueLite { _id: string; code: string; designation: string }
interface ListeDepenses {
  items: DepenseDTO[]; total: number; totalValidees: number; page: number; pages: number;
}

/**
 * Écran des dépenses : sorties d'argent du tiroir-caisse.
 * - Opérateur (`enregistrer_depense`) : enregistre, voit ses dépenses.
 * - Contrôleur (`annuler_depense`) : tout voit, annule avec motif.
 * - Catégories : paramétrage réservé admin/gestionnaire (onglet dédié).
 */
function DepensesInner() {
  const { aAction, user } = useAuthUser();
  const { kiosqueId: kiosqueCourant } = useKiosque();
  const peutSaisir = aAction('enregistrer_depense');
  const peutAnnuler = aAction('annuler_depense');
  const peutParametrer = user?.type === 'admin' || user?.type === 'gestionnaire';

  const [onglet, setOnglet] = useState<'depenses' | 'categories'>('depenses');
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [categories, setCategories] = useState<CategorieDepenseDTO[]>([]);

  // Liste dépenses
  const [data, setData] = useState<ListeDepenses>({ items: [], total: 0, totalValidees: 0, page: 1, pages: 1 });
  const [chargement, setChargement] = useState(true);
  const [fStatut, setFStatut] = useState('');
  const [fKiosque, setFKiosque] = useState('');
  const [fCategorie, setFCategorie] = useState('');
  const [q, setQ] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);

  // Nouvelle dépense
  const [showNew, setShowNew] = useState(false);
  const [nKiosque, setNKiosque] = useState('');
  const [nCategorie, setNCategorie] = useState('');
  const [nMontant, setNMontant] = useState('');
  const [nMotif, setNMotif] = useState('');
  const [nDate, setNDate] = useState('');
  const [enCours, setEnCours] = useState(false);
  const cleIdempotence = useRef<string>(crypto.randomUUID());

  // Annulation
  const [annulDep, setAnnulDep] = useState<DepenseDTO | null>(null);
  const [motifAnnul, setMotifAnnul] = useState('');

  // Catégories (paramétrage)
  const [catsAll, setCatsAll] = useState<CategorieDepenseDTO[]>([]);
  const [chargementCats, setChargementCats] = useState(false);
  const [showCat, setShowCat] = useState(false);
  const [catEdit, setCatEdit] = useState<CategorieDepenseDTO | null>(null);
  const [catDesignation, setCatDesignation] = useState('');

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
    axios.get('/api/depenses/categories', { withCredentials: true })
      .then((res) => setCategories(res.data?.categories || []))
      .catch(() => {});
  }, []);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (fStatut) params.set('statut', fStatut);
    if (fKiosque) params.set('kiosqueId', fKiosque);
    if (fCategorie) params.set('categorieDepenseId', fCategorie);
    if (q) params.set('q', q);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    axios.get<ListeDepenses>(`/api/depenses?${params}`, { withCredentials: true })
      .then((res) => setData(res.data))
      .catch((e) => {
        if (e?.response?.status !== 403) toast.error('Erreur de chargement des dépenses');
      })
      .finally(() => setChargement(false));
  }, [page, fStatut, fKiosque, fCategorie, q, du, au]);

  const chargerCats = useCallback(() => {
    setChargementCats(true);
    axios.get('/api/depenses/categories?tout=1', { withCredentials: true })
      .then((res) => setCatsAll(res.data?.categories || []))
      .catch(() => toast.error('Erreur de chargement des catégories'))
      .finally(() => setChargementCats(false));
  }, []);

  useEffect(() => { if (onglet === 'depenses') charger(); }, [charger, onglet]);
  useEffect(() => { if (onglet === 'categories' && peutParametrer) chargerCats(); }, [chargerCats, onglet, peutParametrer]);

  const ouvrirNouvelle = () => {
    setNKiosque(kiosqueCourant || (kiosques.length === 1 ? kiosques[0]._id : ''));
    setNCategorie('');
    setNMontant('');
    setNMotif('');
    setNDate('');
    cleIdempotence.current = crypto.randomUUID();
    setShowNew(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    const montant = Number(nMontant);
    if (!nKiosque) return toast.warning('Sélectionnez un kiosque.');
    if (!montant || montant < 1) return toast.warning('Montant invalide.');
    setEnCours(true);
    try {
      await axios.post('/api/depenses', {
        kiosqueId: nKiosque,
        categorieDepenseId: nCategorie || null,
        montant,
        motif: nMotif || undefined,
        dateDepense: nDate || undefined,
        idempotencyKey: cleIdempotence.current,
      }, { withCredentials: true });
      toast.success('Dépense enregistrée');
      setShowNew(false);
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors de l’enregistrement');
    } finally {
      setEnCours(false);
    }
  };

  const annuler = async () => {
    if (!annulDep) return;
    if (motifAnnul.trim().length < 3) return toast.warning('Motif obligatoire (3 caractères min).');
    setEnCours(true);
    try {
      await axios.post(`/api/depenses/${annulDep._id}/annuler`, { motif: motifAnnul }, { withCredentials: true });
      toast.success('Dépense annulée — compensation enregistrée en caisse');
      setAnnulDep(null);
      setMotifAnnul('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setEnCours(false);
    }
  };

  const enregistrerCategorie = async (e: React.FormEvent) => {
    e.preventDefault();
    if (catDesignation.trim().length < 2) return toast.warning('Désignation trop courte.');
    setEnCours(true);
    try {
      if (catEdit) {
        await axios.patch(`/api/depenses/categories/${catEdit._id}`, { designation: catDesignation }, { withCredentials: true });
        toast.success('Catégorie modifiée');
      } else {
        await axios.post('/api/depenses/categories', { designation: catDesignation }, { withCredentials: true });
        toast.success('Catégorie créée');
      }
      setShowCat(false);
      chargerCats();
      axios.get('/api/depenses/categories', { withCredentials: true })
        .then((res) => setCategories(res.data?.categories || [])).catch(() => {});
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setEnCours(false);
    }
  };

  const basculerStatutCat = async (c: CategorieDepenseDTO) => {
    try {
      await axios.patch(`/api/depenses/categories/${c._id}`, {
        statut: c.statut === 'actif' ? 'inactif' : 'actif',
      }, { withCredentials: true });
      chargerCats();
      axios.get('/api/depenses/categories', { withCredentials: true })
        .then((res) => setCategories(res.data?.categories || [])).catch(() => {});
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    }
  };

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'caissier', 'comptable']} allowedActions={['enregistrer_depense', 'annuler_depense']}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">
          <i className="bi bi-wallet me-2"></i>Dépenses
          <Badge bg="danger" className="ms-2">Sorties : {fmtMontant(data.totalValidees)} F</Badge>
        </h4>
        {peutSaisir && (
          <Button size="sm" variant="success" onClick={ouvrirNouvelle}>
            <i className="bi bi-plus-lg me-1"></i>Nouvelle dépense
          </Button>
        )}
      </div>

      <Nav variant="tabs" className="mb-3" activeKey={onglet} onSelect={(k) => setOnglet(k as any)}>
        <Nav.Item><Nav.Link eventKey="depenses">Dépenses ({data.total})</Nav.Link></Nav.Item>
        {peutParametrer && <Nav.Item><Nav.Link eventKey="categories">Catégories</Nav.Link></Nav.Item>}
      </Nav>

      {onglet === 'depenses' && (
        <>
          <Card className="mb-3">
            <Card.Body className="py-2">
              <Row className="g-2">
                <Col md={3}>
                  <Form.Control size="sm" placeholder="N°, motif, saisi par…" value={q}
                    onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                </Col>
                <Col md={2}>
                  <Form.Select size="sm" value={fKiosque} onChange={(e) => { setFKiosque(e.target.value); setPage(1); }}>
                    <option value="">Tous les kiosques</option>
                    {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
                  </Form.Select>
                </Col>
                <Col md={2}>
                  <Form.Select size="sm" value={fCategorie} onChange={(e) => { setFCategorie(e.target.value); setPage(1); }}>
                    <option value="">Toutes catégories</option>
                    {categories.map((c) => <option key={c._id} value={c._id}>{c.designation}</option>)}
                  </Form.Select>
                </Col>
                <Col md={2}>
                  <Form.Select size="sm" value={fStatut} onChange={(e) => { setFStatut(e.target.value); setPage(1); }}>
                    <option value="">Tous statuts</option>
                    <option value="validee">Validées</option>
                    <option value="annulee">Annulées</option>
                  </Form.Select>
                </Col>
                <Col md={1}><Form.Control size="sm" type="date" value={du} onChange={(e) => { setDu(e.target.value); setPage(1); }} /></Col>
                <Col md={1}><Form.Control size="sm" type="date" value={au} onChange={(e) => { setAu(e.target.value); setPage(1); }} /></Col>
              </Row>
            </Card.Body>
          </Card>

          <Card>
            <Table responsive hover size="sm" className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>N°</th><th>Date</th><th>Kiosque</th><th>Catégorie</th><th>Motif</th>
                  <th>Saisi par</th><th className="text-end">Montant</th><th>Statut</th><th></th>
                </tr>
              </thead>
              <tbody>
                {chargement && (
                  <tr><td colSpan={9} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
                )}
                {!chargement && data.items.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-4 text-muted">Aucune dépense</td></tr>
                )}
                {!chargement && data.items.map((d) => (
                  <tr key={d._id} className={d.statut === 'annulee' ? 'text-muted' : ''}>
                    <td className="small">{d.numero}</td>
                    <td className="small">{fmtDate(d.dateDepense)}</td>
                    <td className="small">{d.kiosqueNom}</td>
                    <td className="small">{d.categorieNom || '—'}</td>
                    <td className="small">{d.motif || '—'}
                      {d.annulation && (
                        <div className="text-danger small">
                          <i className="bi bi-x-octagon me-1"></i>Annulée : {d.annulation.motif}
                        </div>
                      )}
                    </td>
                    <td className="small">{d.creeParNom}</td>
                    <td className={`text-end fw-semibold ${d.statut === 'annulee' ? 'text-decoration-line-through' : ''}`}>
                      {fmtMontant(d.montant)}
                    </td>
                    <td>
                      {d.statut === 'validee'
                        ? <Badge bg="success">Validée</Badge>
                        : <Badge bg="secondary">Annulée</Badge>}
                    </td>
                    <td className="text-end">
                      {d.statut === 'validee' && peutAnnuler && (
                        <Button size="sm" variant="outline-danger" onClick={() => { setAnnulDep(d); setMotifAnnul(''); }}>
                          <i className="bi bi-x-circle"></i>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          {data.pages > 1 && (
            <Pagination size="sm" className="mt-3">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>{p}</Pagination.Item>
              ))}
            </Pagination>
          )}
        </>
      )}

      {onglet === 'categories' && peutParametrer && (
        <Card>
          <Card.Header className="d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold">Catégories de dépenses</span>
            <Button size="sm" variant="primary" onClick={() => { setCatEdit(null); setCatDesignation(''); setShowCat(true); }}>
              <i className="bi bi-plus-lg me-1"></i>Nouvelle catégorie
            </Button>
          </Card.Header>
          <Table responsive hover size="sm" className="mb-0 align-middle">
            <thead className="table-light">
              <tr><th>Code</th><th>Désignation</th><th>Statut</th><th className="text-end">Actions</th></tr>
            </thead>
            <tbody>
              {chargementCats && (
                <tr><td colSpan={4} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
              )}
              {!chargementCats && catsAll.map((c) => (
                <tr key={c._id}>
                  <td className="small">{c.code}</td>
                  <td>{c.designation}</td>
                  <td>{c.statut === 'actif' ? <Badge bg="success">Active</Badge> : <Badge bg="secondary">Inactive</Badge>}</td>
                  <td className="text-end">
                    <Button size="sm" variant="outline-primary" className="me-2"
                      onClick={() => { setCatEdit(c); setCatDesignation(c.designation); setShowCat(true); }}>
                      <i className="bi bi-pencil"></i>
                    </Button>
                    <Button size="sm" variant={c.statut === 'actif' ? 'outline-secondary' : 'outline-success'}
                      onClick={() => basculerStatutCat(c)}>
                      <i className={`bi ${c.statut === 'actif' ? 'bi-pause-circle' : 'bi-play-circle'}`}></i>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Modale nouvelle dépense */}
      <Modal show={showNew} onHide={() => setShowNew(false)} centered scrollable>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>Nouvelle dépense</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Alert variant="info" className="py-2 small">
              <i className="bi bi-info-circle me-1"></i>
              La dépense sort immédiatement du tiroir-caisse du kiosque (caisse ouverte requise).
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label>Kiosque *</Form.Label>
              <Form.Select value={nKiosque} onChange={(e) => setNKiosque(e.target.value)} required>
                <option value="">— Choisir —</option>
                {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Catégorie</Form.Label>
              <Form.Select value={nCategorie} onChange={(e) => setNCategorie(e.target.value)}>
                <option value="">Divers (sans catégorie)</option>
                {categories.map((c) => <option key={c._id} value={c._id}>{c.designation}</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Montant (FCFA) *</Form.Label>
              <Form.Control type="number" min={1} step={1} value={nMontant}
                onChange={(e) => setNMontant(e.target.value)} required autoFocus />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Motif / description</Form.Label>
              <Form.Control as="textarea" rows={2} value={nMotif}
                onChange={(e) => setNMotif(e.target.value)} placeholder="Ex : réapprovisionnement gaz…" />
            </Form.Group>
            <Form.Group className="mb-1">
              <Form.Label>Date (par défaut : aujourd’hui)</Form.Label>
              <Form.Control type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" size="sm" onClick={() => setShowNew(false)}>Fermer</Button>
            <Button variant="success" size="sm" type="submit" disabled={enCours}>
              {enCours ? <Spinner animation="border" size="sm" /> : <><i className="bi bi-check-lg me-1"></i>Enregistrer</>}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Modale annulation */}
      <Modal show={!!annulDep} onHide={() => setAnnulDep(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Annuler la dépense {annulDep?.numero}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="py-2 small">
            <i className="bi bi-exclamation-triangle me-1"></i>
            La dépense sera conservée (traçabilité) et le montant
            ({fmtMontant(annulDep?.montant || 0)} F) rentrera en caisse par un
            mouvement compensateur.
          </Alert>
          <Form.Group>
            <Form.Label>Motif d’annulation *</Form.Label>
            <Form.Control as="textarea" rows={2} value={motifAnnul}
              onChange={(e) => setMotifAnnul(e.target.value)} autoFocus />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setAnnulDep(null)}>Fermer</Button>
          <Button variant="danger" size="sm" onClick={annuler} disabled={enCours}>
            {enCours ? <Spinner animation="border" size="sm" /> : <><i className="bi bi-x-circle me-1"></i>Annuler la dépense</>}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale catégorie */}
      <Modal show={showCat} onHide={() => setShowCat(false)} centered>
        <Form onSubmit={enregistrerCategorie}>
          <Modal.Header closeButton>
            <Modal.Title>{catEdit ? `Modifier ${catEdit.code}` : 'Nouvelle catégorie'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group>
              <Form.Label>Désignation *</Form.Label>
              <Form.Control value={catDesignation} onChange={(e) => setCatDesignation(e.target.value)} required autoFocus />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" size="sm" onClick={() => setShowCat(false)}>Fermer</Button>
            <Button variant="primary" size="sm" type="submit" disabled={enCours}>
              {enCours ? <Spinner animation="border" size="sm" /> : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </RoleGuard>
  );
}

export default function PageDepenses() {
  return <DepensesInner />;
}
