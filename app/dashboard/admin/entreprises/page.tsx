'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Col, Form, Modal, Offcanvas, Row, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { fmtDate } from '@/lib/format';

interface Abo {
  planCode: string;
  planNom: string;
  statut: 'essai' | 'actif' | 'grace' | 'expire';
  expireLe: string;
  joursRestants: number;
}

interface EntrepriseRow {
  _id: string;
  nomSociete: string;
  nomCommercial?: string;
  telephone?: string;
  email?: string;
  ville?: string;
  statut?: string;
  nbKiosques: number;
  nbUtilisateurs: number;
  createdAt?: string;
  abonnement?: Abo | null;
}

interface Stats {
  entreprises: { total: number; suspendues: number; enEssai: number; expirees: number; expirant7j: number; nouvelles30j: number; parPlan: Record<string, number> };
  utilisateurs: number;
  kiosques: number;
  ventes: { total: number; volume: number };
  revenus: { mois: number; total: number };
  connexions7j: number;
}

interface Plan {
  _id: string;
  code: string;
  nom: string;
  prixMensuel: number;
  dureeEssaiJours?: number;
  maxKiosques: number;
  maxUtilisateurs: number;
  description?: string;
  statut: string;
}

interface Detail extends EntrepriseRow {
  derniereActivite?: string | null;
  paiements?: any[];
}

const fmtMontant = (n: number) => `${(n || 0).toLocaleString('fr-FR')} FCFA`;

const BADGE_ABO: Record<string, { bg: string; libelle: string }> = {
  essai: { bg: 'info', libelle: 'Essai' },
  actif: { bg: 'success', libelle: 'Actif' },
  grace: { bg: 'warning', libelle: 'Grâce' },
  expire: { bg: 'danger', libelle: 'Expiré' },
};

/**
 * Administration plateforme (super-admin) : métriques SaaS, liste des
 * entreprises avec état d'abonnement, encaissement des paiements,
 * gestion des plans. Aucune donnée métier des tenants n'est affichée.
 */
function AdminEntreprisesInner() {
  const [entreprises, setEntreprises] = useState<EntrepriseRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [chargement, setChargement] = useState(true);

  // Paiement d'abonnement
  const [showPaiement, setShowPaiement] = useState(false);
  const [cible, setCible] = useState<EntrepriseRow | null>(null);
  const [planCode, setPlanCode] = useState('KIOSQUE');
  const [mois, setMois] = useState(1);
  const [montant, setMontant] = useState(10000);
  const [modePaiement, setModePaiement] = useState('Wave');
  const [reference, setReference] = useState('');
  const [savingPaiement, setSavingPaiement] = useState(false);

  // Détail entreprise
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // Plans
  const [showPlans, setShowPlans] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [planForm, setPlanForm] = useState({ nom: '', prixMensuel: 0, maxKiosques: 0, maxUtilisateurs: 0, dureeEssaiJours: 0, description: '', statut: 'actif', code: '' });

  const charger = useCallback(() => {
    setChargement(true);
    Promise.all([
      axios.get('/api/entreprises', { withCredentials: true }),
      axios.get('/api/admin/stats', { withCredentials: true }),
      axios.get('/api/admin/plans', { withCredentials: true }),
    ])
      .then(([r1, r2, r3]) => {
        setEntreprises(r1.data?.entreprises || []);
        setStats(r2.data || null);
        setPlans(r3.data?.plans || []);
      })
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const basculer = async (e: EntrepriseRow) => {
    const statut = e.statut === 'actif' ? 'suspendu' : 'actif';
    const msg = statut === 'suspendu'
      ? `Suspendre le compte « ${e.nomSociete} » ? Ses utilisateurs perdront l'accès.`
      : `Réactiver le compte « ${e.nomSociete} » ?`;
    if (!confirm(msg)) return;
    try {
      await axios.patch(`/api/entreprises/${e._id}`, { statut }, { withCredentials: true });
      toast.success(`Compte ${statut === 'actif' ? 'réactivé' : 'suspendu'}`);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const ouvrirPaiement = (e: EntrepriseRow) => {
    setCible(e);
    const code = e.abonnement?.planCode && e.abonnement.planCode !== 'ESSAI' ? e.abonnement.planCode : 'KIOSQUE';
    setPlanCode(code);
    const p = plans.find((pl) => pl.code === code);
    setMontant(p?.prixMensuel || 10000);
    setMois(1); setModePaiement('Wave'); setReference('');
    setShowPaiement(true);
  };

  const changerPlan = (code: string) => {
    setPlanCode(code);
    const p = plans.find((pl) => pl.code === code);
    if (p) setMontant(p.prixMensuel * mois);
  };

  const enregistrerPaiement = async () => {
    if (!cible) return;
    setSavingPaiement(true);
    try {
      const res = await axios.post('/api/admin/abonnements', {
        entrepriseId: cible._id, planCode, montant, mois, modePaiement, reference,
      }, { withCredentials: true });
      toast.success(res.data?.message || 'Paiement enregistré');
      setShowPaiement(false);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    } finally {
      setSavingPaiement(false);
    }
  };

  const ouvrirDetail = async (e: EntrepriseRow) => {
    try {
      const res = await axios.get(`/api/entreprises/${e._id}`, { withCredentials: true });
      setDetail(res.data.entreprise);
      setShowDetail(true);
    } catch {
      toast.error('Impossible de charger le détail');
    }
  };

  const sauverPlan = async () => {
    try {
      if (editPlan) {
        await axios.patch(`/api/admin/plans/${editPlan._id}`, planForm, { withCredentials: true });
        toast.success('Plan mis à jour');
      } else {
        await axios.post('/api/admin/plans', planForm, { withCredentials: true });
        toast.success('Plan créé');
      }
      setEditPlan(null);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const ouvrirEditionPlan = (p?: Plan) => {
    if (p) {
      setEditPlan(p);
      setPlanForm({ nom: p.nom, prixMensuel: p.prixMensuel, maxKiosques: p.maxKiosques, maxUtilisateurs: p.maxUtilisateurs, dureeEssaiJours: p.dureeEssaiJours || 0, description: p.description || '', statut: p.statut, code: p.code });
    } else {
      setEditPlan({ _id: '', code: '', nom: '', prixMensuel: 0, maxKiosques: 1, maxUtilisateurs: 3, statut: 'actif' });
      setPlanForm({ nom: '', prixMensuel: 0, maxKiosques: 1, maxUtilisateurs: 3, dureeEssaiJours: 0, description: '', statut: 'actif', code: '' });
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Plateforme — Pilotage SaaS</h3>
        <Button variant="outline-primary" size="sm" onClick={() => setShowPlans(true)}>
          <i className="bi bi-tag me-1" />Plans ({plans.length})
        </Button>
      </div>

      {/* Métriques plateforme */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card carte-stat"><div className="card-body d-flex align-items-center gap-3">
            <span className="stat-icone"><i className="bi bi-buildings"></i></span>
            <div>
              <div className="text-muted small">Entreprises</div>
              <div className="fs-4 fw-bold">{stats?.entreprises.total ?? '—'}</div>
              <small className="text-muted">+{stats?.entreprises.nouvelles30j ?? 0} sur 30 j</small>
            </div>
          </div></div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card carte-stat"><div className="card-body d-flex align-items-center gap-3">
            <span className="stat-icone"><i className="bi bi-cash-coin"></i></span>
            <div>
              <div className="text-muted small">Revenus du mois</div>
              <div className="fs-4 fw-bold">{fmtMontant(stats?.revenus.mois || 0)}</div>
              <small className="text-muted">Total : {fmtMontant(stats?.revenus.total || 0)}</small>
            </div>
          </div></div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card carte-stat"><div className="card-body d-flex align-items-center gap-3">
            <span className="stat-icone"><i className="bi bi-hourglass-split"></i></span>
            <div>
              <div className="text-muted small">Abonnements</div>
              <div className="fs-4 fw-bold">
                {stats ? `${stats.entreprises.enEssai} essai${stats.entreprises.enEssai > 1 ? 's' : ''}` : '—'}
              </div>
              <small className="text-danger">{stats?.entreprises.expirant7j ?? 0} expire(nt) ≤ 7 j · {stats?.entreprises.expirees ?? 0} expiré(s)</small>
            </div>
          </div></div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card carte-stat"><div className="card-body d-flex align-items-center gap-3">
            <span className="stat-icone"><i className="bi bi-activity"></i></span>
            <div>
              <div className="text-muted small">Activité plateforme</div>
              <div className="fs-4 fw-bold">{stats?.connexions7j ?? '—'}</div>
              <small className="text-muted">connexions sur 7 j · {stats?.ventes.total ?? 0} ventes totales</small>
            </div>
          </div></div>
        </div>
      </div>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle">
            <thead className="table-light">
              <tr>
                <th>Entreprise</th>
                <th>Contact</th>
                <th>K / U</th>
                <th>Abonnement</th>
                <th>Échéance</th>
                <th>Statut</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={7} className="text-center p-4">Chargement...</td></tr>
              ) : entreprises.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-4 text-muted">Aucune entreprise inscrite.</td></tr>
              ) : (
                entreprises.map((e) => {
                  const abo = e.abonnement;
                  const b = abo ? BADGE_ABO[abo.statut] : null;
                  return (
                    <tr key={e._id}>
                      <td>
                        <div className="fw-semibold">{e.nomSociete}</div>
                        {e.nomCommercial && <small className="text-muted">{e.nomCommercial}</small>}
                      </td>
                      <td>
                        <div>{e.telephone || '—'}</div>
                        <small className="text-muted">{e.email || e.ville || ''}</small>
                      </td>
                      <td><Badge bg="secondary">{e.nbKiosques} / {e.nbUtilisateurs}</Badge></td>
                      <td>
                        {abo && b
                          ? <><Badge bg={b.bg}>{b.libelle}</Badge> <small className="text-muted">{abo.planNom}</small></>
                          : <Badge bg="light" text="dark">—</Badge>}
                      </td>
                      <td>
                        {abo ? (
                          <>
                            <div>{fmtDate(abo.expireLe)}</div>
                            <small className={abo.joursRestants <= 7 ? 'text-danger fw-semibold' : 'text-muted'}>
                              {abo.joursRestants > 0 ? `${abo.joursRestants} j restants` : 'dépassée'}
                            </small>
                          </>
                        ) : '—'}
                      </td>
                      <td>
                        {e.statut === 'actif'
                          ? <Badge bg="success">Actif</Badge>
                          : <Badge bg="danger">Suspendu</Badge>}
                      </td>
                      <td className="text-end text-nowrap">
                        <Button size="sm" variant="outline-primary" className="me-1" title="Détail" onClick={() => ouvrirDetail(e)}>
                          <i className="bi bi-eye" />
                        </Button>
                        <Button size="sm" variant="outline-success" className="me-1" title="Encaisser un abonnement" onClick={() => ouvrirPaiement(e)}>
                          <i className="bi bi-cash" />
                        </Button>
                        <Button
                          size="sm"
                          variant={e.statut === 'actif' ? 'outline-danger' : 'outline-success'}
                          onClick={() => basculer(e)}
                        >
                          <i className={`bi ${e.statut === 'actif' ? 'bi-pause-circle' : 'bi-play-circle'}`}></i>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Modale encaissement abonnement */}
      <Modal show={showPaiement} onHide={() => setShowPaiement(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Encaisser un abonnement</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            Entreprise : <strong>{cible?.nomSociete}</strong>
            {cible?.abonnement && <> — échéance actuelle : {fmtDate(cible.abonnement.expireLe)}</>}
          </p>
          <Row className="g-3">
            <Col md={6}>
              <Form.Label>Plan</Form.Label>
              <Form.Select value={planCode} onChange={(e) => changerPlan(e.target.value)}>
                {plans.map((p) => <option key={p.code} value={p.code}>{p.nom} ({fmtMontant(p.prixMensuel)}/mois)</option>)}
              </Form.Select>
            </Col>
            <Col md={6}>
              <Form.Label>Durée (mois)</Form.Label>
              <Form.Control type="number" min={1} max={36} value={mois}
                onChange={(e) => {
                  const m = Math.max(1, Number(e.target.value) || 1);
                  setMois(m);
                  const p = plans.find((pl) => pl.code === planCode);
                  if (p) setMontant(p.prixMensuel * m);
                }} />
            </Col>
            <Col md={6}>
              <Form.Label>Montant encaissé (FCFA)</Form.Label>
              <Form.Control type="number" min={0} value={montant} onChange={(e) => setMontant(Number(e.target.value) || 0)} />
            </Col>
            <Col md={6}>
              <Form.Label>Mode de paiement</Form.Label>
              <Form.Select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                {['Wave', 'Orange Money', 'MTN MoMo', 'Virement', 'Espèces', 'Autre'].map((m) => <option key={m}>{m}</option>)}
              </Form.Select>
            </Col>
            <Col md={12}>
              <Form.Label>Référence transaction (optionnel)</Form.Label>
              <Form.Control value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ex : TXN-WAVE-..." />
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPaiement(false)}>Annuler</Button>
          <Button variant="success" onClick={enregistrerPaiement} disabled={savingPaiement}>
            {savingPaiement ? 'Enregistrement...' : 'Enregistrer le paiement'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Panneau détail entreprise */}
      <Offcanvas show={showDetail} onHide={() => setShowDetail(false)} placement="end">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>{detail?.nomSociete}</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {detail && (
            <>
              <div className="mb-3">
                <small className="text-muted d-block">Contact</small>
                {detail.telephone || '—'} · {detail.email || '—'} · {detail.ville || '—'}
              </div>
              <div className="mb-3">
                <small className="text-muted d-block">Compteurs</small>
                {detail.nbKiosques} kiosque(s) · {detail.nbUtilisateurs} utilisateur(s)
              </div>
              <div className="mb-3">
                <small className="text-muted d-block">Dernière activité</small>
                {detail.derniereActivite ? new Date(detail.derniereActivite).toLocaleString('fr-FR') : 'Jamais connecté'}
              </div>
              {detail.abonnement && (
                <div className="mb-3">
                  <small className="text-muted d-block">Abonnement</small>
                  <Badge bg={BADGE_ABO[detail.abonnement.statut]?.bg || 'secondary'}>
                    {detail.abonnement.planNom} — {BADGE_ABO[detail.abonnement.statut]?.libelle}
                  </Badge>
                  <div className="small mt-1">Expire le {fmtDate(detail.abonnement.expireLe)} ({detail.abonnement.joursRestants} j)</div>
                </div>
              )}
              <div>
                <small className="text-muted d-block mb-2">Paiements récents</small>
                {detail.paiements?.length ? (
                  <Table size="sm" bordered>
                    <thead><tr><th>Date</th><th>Plan</th><th>Montant</th><th>Mode</th></tr></thead>
                    <tbody>
                      {detail.paiements.map((p: any) => (
                        <tr key={p._id}>
                          <td>{fmtDate(p.createdAt)}</td>
                          <td>{p.planCode}</td>
                          <td>{fmtMontant(p.montant)}</td>
                          <td>{p.modePaiement}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : <p className="small text-muted">Aucun paiement enregistré.</p>}
              </div>
            </>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      {/* Modale gestion des plans */}
      <Modal show={showPlans} onHide={() => { setShowPlans(false); setEditPlan(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Plans d&apos;abonnement</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex justify-content-end mb-2">
            <Button size="sm" variant="outline-primary" onClick={() => ouvrirEditionPlan()}>
              <i className="bi bi-plus me-1" />Nouveau plan
            </Button>
          </div>
          {editPlan ? (
            <Card className="border-primary">
              <Card.Body>
                <h6>{editPlan._id ? `Modifier « ${editPlan.code} »` : 'Nouveau plan'}</h6>
                <Row className="g-2">
                  {!editPlan._id && (
                    <Col md={4}><Form.Label>Code</Form.Label>
                      <Form.Control size="sm" value={planForm.code} placeholder="EX : PRO" onChange={(e) => setPlanForm({ ...planForm, code: e.target.value.toUpperCase() })} /></Col>
                  )}
                  <Col md={4}><Form.Label>Nom</Form.Label>
                    <Form.Control size="sm" value={planForm.nom} onChange={(e) => setPlanForm({ ...planForm, nom: e.target.value })} /></Col>
                  <Col md={4}><Form.Label>Prix mensuel (FCFA)</Form.Label>
                    <Form.Control size="sm" type="number" min={0} value={planForm.prixMensuel} onChange={(e) => setPlanForm({ ...planForm, prixMensuel: Number(e.target.value) || 0 })} /></Col>
                  <Col md={4}><Form.Label>Max kiosques (0 = ∞)</Form.Label>
                    <Form.Control size="sm" type="number" min={0} value={planForm.maxKiosques} onChange={(e) => setPlanForm({ ...planForm, maxKiosques: Number(e.target.value) || 0 })} /></Col>
                  <Col md={4}><Form.Label>Max utilisateurs (0 = ∞)</Form.Label>
                    <Form.Control size="sm" type="number" min={0} value={planForm.maxUtilisateurs} onChange={(e) => setPlanForm({ ...planForm, maxUtilisateurs: Number(e.target.value) || 0 })} /></Col>
                  <Col md={4}><Form.Label>Durée essai (jours)</Form.Label>
                    <Form.Control size="sm" type="number" min={0} value={planForm.dureeEssaiJours} onChange={(e) => setPlanForm({ ...planForm, dureeEssaiJours: Number(e.target.value) || 0 })} /></Col>
                  <Col md={8}><Form.Label>Description</Form.Label>
                    <Form.Control size="sm" value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} /></Col>
                  <Col md={4}><Form.Label>Statut</Form.Label>
                    <Form.Select size="sm" value={planForm.statut} onChange={(e) => setPlanForm({ ...planForm, statut: e.target.value })}>
                      <option value="actif">Actif</option><option value="inactif">Inactif</option>
                    </Form.Select></Col>
                </Row>
                <div className="mt-3 d-flex gap-2">
                  <Button size="sm" variant="primary" onClick={sauverPlan}>Enregistrer</Button>
                  <Button size="sm" variant="outline-secondary" onClick={() => setEditPlan(null)}>Annuler</Button>
                </div>
              </Card.Body>
            </Card>
          ) : (
            <Table size="sm" hover className="align-middle">
              <thead><tr><th>Code</th><th>Nom</th><th>Prix/mois</th><th>Kiosques</th><th>Utilisateurs</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p._id}>
                    <td><Badge bg="light" text="dark">{p.code}</Badge></td>
                    <td>{p.nom}</td>
                    <td>{fmtMontant(p.prixMensuel)}</td>
                    <td>{p.maxKiosques === 0 ? '∞' : p.maxKiosques}</td>
                    <td>{p.maxUtilisateurs === 0 ? '∞' : p.maxUtilisateurs}</td>
                    <td><Badge bg={p.statut === 'actif' ? 'success' : 'secondary'}>{p.statut}</Badge></td>
                    <td><Button size="sm" variant="link" onClick={() => ouvrirEditionPlan(p)}><i className="bi bi-pencil" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}

export default function AdminEntreprisesPage() {
  return (
    <RoleGuard allowedRoles={['adminsuper']} strict>
      <AdminEntreprisesInner />
    </RoleGuard>
  );
}
