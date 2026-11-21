'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ventesHorsLignePourKiosque, synchroniserVentesHorsLigne } from '@/lib/offlineQueue';
import type {
  MouvementCaisseDTO, RemiseDTO, SessionCaisseDTO,
} from '@/types/caisses';

const STATUTS_SESSION: Record<string, { label: string; color: string }> = {
  ouverte: { label: 'Ouverte', color: 'success' },
  en_cloture: { label: 'Point en attente', color: 'warning' },
  cloturee: { label: 'Clôturée', color: 'secondary' },
};
const STATUTS_REMISE: Record<string, { label: string; color: string }> = {
  declaree: { label: 'Déclarée', color: 'warning' },
  confirmee: { label: 'Confirmée', color: 'success' },
  annulee: { label: 'Annulée', color: 'danger' },
};
const MOTIFS_MVT: Record<string, string> = {
  vente: 'Vente', remboursement: 'Remboursement', annulation_vente: 'Annulation vente',
  depense: 'Dépense', fond_caisse: 'Fond de caisse', remise: 'Remise d\'argent', divers: 'Divers',
};

function fmtHeure(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Écran Caisse — double visage :
 * - Opérateur (vendeur) : ouverture, point journalier au comptant compté,
 *   déclaration de remise. Le solde théorique n'est JAMAIS affiché.
 * - Contrôleur : soldes, écarts, clôture, rejet de point, confirmation /
 *   annulation des remises, historique des sessions et mouvements.
 */
function CaisseInner() {
  const { aAction } = useAuthUser();
  const { kiosqueId, kiosques, kiosque, changerKiosque } = useKiosque();
  const peutOuvrir = aAction('ouvrir_caisse');
  const peutCloturer = aAction('cloturer_caisse');
  const peutDeclarer = aAction('declarer_remise');
  const peutConfirmer = aAction('confirmer_remise');
  const controleur = peutCloturer || peutConfirmer;

  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<SessionCaisseDTO | null>(null);
  const [remises, setRemises] = useState<RemiseDTO[]>([]);
  const [mouvements, setMouvements] = useState<MouvementCaisseDTO[]>([]);
  const [historique, setHistorique] = useState<SessionCaisseDTO[]>([]);
  const [onglet, setOnglet] = useState<'remises' | 'sessions'>('remises');
  const [enCours, setEnCours] = useState(false);

  // Modales
  const [showOuverture, setShowOuverture] = useState(false);
  const [fond, setFond] = useState('');
  const [showPoint, setShowPoint] = useState(false);
  const [compte, setCompte] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [showRejet, setShowRejet] = useState(false);
  const [motifRejet, setMotifRejet] = useState('');
  const [showCloture, setShowCloture] = useState(false);
  const [showRemise, setShowRemise] = useState(false);
  const [montantRemise, setMontantRemise] = useState('');
  const [noteRemise, setNoteRemise] = useState('');
  const [remiseAAnnuler, setRemiseAAnnuler] = useState<RemiseDTO | null>(null);
  const [motifAnnulation, setMotifAnnulation] = useState('');
  const [sessionDetail, setSessionDetail] = useState<SessionCaisseDTO | null>(null);
  // Ventes hors-ligne en attente sur CET appareil pour ce kiosque : elles
  // doivent être synchronisées AVANT le point / la clôture pour que le
  // solde théorique soit complet (elles restent acceptées en `en_cloture`).
  const [nbHorsLigne, setNbHorsLigne] = useState(0);
  const cleRemise = useRef<string>(crypto.randomUUID());

  const charger = useCallback(async () => {
    if (!kiosqueId) { setSession(null); setChargement(false); return; }
    setChargement(true);
    try {
      const [rS, rR] = await Promise.all([
        axios.get(`/api/caisses/actuelle?kiosqueId=${kiosqueId}`, { withCredentials: true }),
        axios.get(`/api/remises?kiosqueId=${kiosqueId}&limit=50`, { withCredentials: true }),
      ]);
      const s: SessionCaisseDTO | null = rS.data?.session || null;
      setSession(s);
      setRemises(rR.data?.items || []);
      if (s && controleur) {
        const rM = await axios.get(`/api/caisses/${s._id}/mouvements`, { withCredentials: true });
        setMouvements(rM.data?.mouvements || []);
      } else {
        setMouvements([]);
      }
      if (controleur) {
        const rH = await axios.get(`/api/caisses?kiosqueId=${kiosqueId}&limit=20`, { withCredentials: true });
        setHistorique(rH.data?.items || []);
      }
    } catch {
      setSession(null);
    } finally {
      setChargement(false);
    }
  }, [kiosqueId, controleur]);

  useEffect(() => { charger(); }, [charger]);

  // Compte des ventes hors-ligne du kiosque courant, mis à jour à chaque
  // changement de file et au retour sur la page.
  useEffect(() => {
    const maj = () =>
      setNbHorsLigne(kiosqueId ? ventesHorsLignePourKiosque(kiosqueId).length : 0);
    maj();
    window.addEventListener('ek-offline-change', maj);
    window.addEventListener('focus', maj);
    return () => {
      window.removeEventListener('ek-offline-change', maj);
      window.removeEventListener('focus', maj);
    };
  }, [kiosqueId]);

  const synchroniserFile = async () => {
    setEnCours(true);
    try {
      const res = await synchroniserVentesHorsLigne();
      if (res.envoyees > 0) {
        toast.success(`${res.envoyees} vente(s) synchronisée(s) — soldes mis à jour`);
      }
      for (const e of res.echecs) toast.error(`Vente rejetée : ${e.message}`);
      if (res.envoyees === 0 && res.echecs.length === 0) {
        toast.info('Aucune vente synchronisable (toujours hors-ligne ?)');
      }
      charger();
    } finally {
      setEnCours(false);
    }
  };

  const ouvrir = async () => {
    setEnCours(true);
    try {
      await axios.post('/api/caisses/ouverture',
        { kiosqueId, fondDeCaisse: Number(fond) || 0 }, { withCredentials: true });
      toast.success('Caisse ouverte');
      setShowOuverture(false); setFond('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const pointer = async () => {
    if (!session) return;
    setEnCours(true);
    try {
      await axios.post(`/api/caisses/${session._id}/point`,
        { montantCompte: Number(compte) || 0, commentaire }, { withCredentials: true });
      toast.success('Point journalier déclaré — en attente de validation');
      setShowPoint(false); setCompte(''); setCommentaire('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const cloturer = async () => {
    if (!session) return;
    setEnCours(true);
    try {
      await axios.post(`/api/caisses/${session._id}/cloturer`,
        { commentaire }, { withCredentials: true });
      toast.success('Caisse clôturée');
      setShowCloture(false); setCommentaire('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const rejeter = async () => {
    if (!session) return;
    setEnCours(true);
    try {
      await axios.post(`/api/caisses/${session._id}/rouvrir`,
        { commentaire: motifRejet }, { withCredentials: true });
      toast.success('Point rejeté — la caisse est rouverte');
      setShowRejet(false); setMotifRejet('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const declarerRemise = async () => {
    setEnCours(true);
    try {
      await axios.post('/api/remises',
        { kiosqueId, montant: Number(montantRemise) || 0, note: noteRemise, idempotencyKey: cleRemise.current },
        { withCredentials: true });
      toast.success('Remise déclarée — en attente de confirmation');
      setShowRemise(false); setMontantRemise(''); setNoteRemise('');
      cleRemise.current = crypto.randomUUID();
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const confirmerRemise = async (r: RemiseDTO) => {
    setEnCours(true);
    try {
      await axios.post(`/api/remises/${r._id}/confirmer`, {}, { withCredentials: true });
      toast.success(`Remise ${r.numero} confirmée`);
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const annulerRemise = async () => {
    if (!remiseAAnnuler) return;
    setEnCours(true);
    try {
      await axios.post(`/api/remises/${remiseAAnnuler._id}/annuler`,
        { motif: motifAnnulation }, { withCredentials: true });
      toast.success('Remise annulée');
      setRemiseAAnnuler(null); setMotifAnnulation('');
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally { setEnCours(false); }
  };

  const ouvrirDetail = async (s: SessionCaisseDTO) => {
    try {
      const [rD, rM] = await Promise.all([
        axios.get(`/api/caisses/${s._id}`, { withCredentials: true }),
        axios.get(`/api/caisses/${s._id}/mouvements`, { withCredentials: true }),
      ]);
      setSessionDetail({ ...rD.data.session });
      setMouvements(rM.data?.mouvements || []);
    } catch { toast.error('Erreur de chargement'); }
  };

  const st = session ? STATUTS_SESSION[session.statut] : null;
  const pointAttente = session?.pointEnAttente;

  // Mouvements postérieurs au point en attente : les ventes continuent
  // d'entrer dans la session — le propriétaire doit les voir séparément
  // pour réconcilier (compté au point + après = attendu final).
  const apresPoint = useMemo(() => {
    if (!controleur || !pointAttente?.datePoint) return null;
    const t = new Date(pointAttente.datePoint).getTime();
    const apres = mouvements.filter((m) => new Date(m.date).getTime() > t);
    const entrees = apres.filter((m) => m.type === 'entree').reduce((s, m) => s + m.montant, 0);
    const sorties = apres.filter((m) => m.type === 'sortie').reduce((s, m) => s + m.montant, 0);
    const nbVentes = apres.filter((m) => m.motif === 'vente').length;
    return { entrees, sorties, nbVentes, total: apres.length };
  }, [controleur, pointAttente, mouvements]);

  return (
    <RoleGuard
      allowedRoles={['gestionnaire', 'responsable', 'caissier', 'vendeur', 'comptable']}
      allowedActions={['ouvrir_caisse', 'cloturer_caisse', 'declarer_remise', 'confirmer_remise']}
    >
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0"><i className="bi bi-cash-stack me-2"></i>Gestion des caisses</h4>
        <Form.Select
          size="sm" style={{ maxWidth: 260 }} value={kiosqueId}
          onChange={(e) => changerKiosque(e.target.value)}
        >
          {kiosques.map((k) => (
            <option key={k._id} value={k._id}>{k.code} — {k.designation}</option>
          ))}
        </Form.Select>
      </div>

      {!kiosqueId ? (
        <Alert variant="info">Sélectionnez un kiosque pour gérer sa caisse.</Alert>
      ) : chargement ? (
        <div className="text-center py-5"><Spinner animation="border" variant="success" /></div>
      ) : (
        <>
          {/* ============ Session courante ============ */}
          <Card className="mb-3 shadow-sm">
            <Card.Body>
              {!session ? (
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div>
                    <h6 className="mb-1">Aucune caisse ouverte sur {kiosque?.designation || 'ce kiosque'}</h6>
                    <small className="text-muted">Ouvrez la caisse pour commencer la journée.</small>
                  </div>
                  {peutOuvrir && (
                    <Button variant="success" onClick={() => setShowOuverture(true)}>
                      <i className="bi bi-unlock me-1"></i>Ouvrir la caisse
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
                    <div>
                      <h6 className="mb-1">
                        {session.numero} <Badge bg={st!.color}>{st!.label}</Badge>
                      </h6>
                      <small className="text-muted">
                        Ouverte par {session.ouverteParNom} · {fmtHeure(session.dateOuverture)}
                        {' · '}Fond : {fmtMontant(session.fondDeCaisse)} F
                      </small>
                    </div>
                    <div className="d-flex gap-2 flex-wrap">
                      {session.statut === 'ouverte' && (peutOuvrir || aAction('enregistrer_vente')) && (
                        <Button variant="outline-success" size="sm" onClick={() => setShowPoint(true)}>
                          <i className="bi bi-clipboard-check me-1"></i>Faire mon point
                        </Button>
                      )}
                      {session.statut !== 'cloturee' && peutDeclarer && (
                        <Button variant="outline-primary" size="sm" onClick={() => setShowRemise(true)}>
                          <i className="bi bi-send me-1"></i>Déclarer une remise
                        </Button>
                      )}
                      {session.statut === 'en_cloture' && peutCloturer && (
                        <Button variant="outline-warning" size="sm" onClick={() => setShowRejet(true)}>
                          <i className="bi bi-arrow-counterclockwise me-1"></i>Rejeter le point
                        </Button>
                      )}
                      {session.statut !== 'cloturee' && peutCloturer && (
                        <Button variant="success" size="sm" onClick={() => setShowCloture(true)}
                          disabled={nbHorsLigne > 0}
                          title={nbHorsLigne > 0 ? 'Synchronisez d\'abord les ventes hors-ligne' : ''}>
                          <i className="bi bi-lock me-1"></i>Clôturer
                        </Button>
                      )}
                    </div>
                  </div>

                  {session.statut !== 'cloturee' && nbHorsLigne > 0 && (
                    <Alert variant="warning" className="mt-2 mb-0 py-2 small d-flex align-items-center justify-content-between">
                      <span>
                        <i className="bi bi-cloud-arrow-up me-2"></i>
                        <strong>{nbHorsLigne} vente(s) hors-ligne</strong> en attente sur cet appareil.
                        Synchronisez-les avant le point ou la clôture — sinon elles seront
                        refusées et le solde sera faux.
                      </span>
                      <Button variant="outline-dark" size="sm" className="ms-3 flex-shrink-0"
                        onClick={synchroniserFile} disabled={enCours}>
                        {enCours ? <Spinner animation="border" size="sm" /> : 'Synchroniser'}
                      </Button>
                    </Alert>
                  )}

                  {controleur && (
                    <Row className="g-2 text-center">
                      <Col xs={6} md={3}>
                        <div className="border rounded p-2 bg-light">
                          <small className="text-muted d-block">Entrées</small>
                          <strong className="text-success">+{fmtMontant(session.totalEntrees)} F</strong>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="border rounded p-2 bg-light">
                          <small className="text-muted d-block">Sorties</small>
                          <strong className="text-danger">−{fmtMontant(session.totalSorties)} F</strong>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="border rounded p-2 bg-light">
                          <small className="text-muted d-block">Solde théorique</small>
                          <strong>{fmtMontant(session.soldeTheorique)} F</strong>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="border rounded p-2 bg-light">
                          <small className="text-muted d-block">Remises en attente</small>
                          <strong className="text-warning">{fmtMontant(session.remisesEnAttente)} F</strong>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {controleur && pointAttente && (
                    <Alert variant={pointAttente.ecart === 0 ? 'success' : 'warning'} className="mt-3 mb-0 py-2">
                      <i className="bi bi-clipboard-check me-2"></i>
                      Point déclaré par <strong>{pointAttente.declareParNom}</strong> à {fmtHeure(pointAttente.datePoint)} —{' '}
                      compté : <strong>{fmtMontant(pointAttente.montantCompte)} F</strong>, attendu :{' '}
                      {fmtMontant(pointAttente.soldeTheorique)} F, écart :{' '}
                      <strong className={pointAttente.ecart !== 0 ? 'text-danger' : ''}>
                        {pointAttente.ecart >= 0 ? '+' : ''}{fmtMontant(pointAttente.ecart)} F
                      </strong>
                      {apresPoint && apresPoint.total > 0 && (
                        <span className="d-block mt-1 small border-top pt-1">
                          <i className="bi bi-clock-history me-1"></i>
                          Après le point : <strong>{apresPoint.nbVentes} vente(s)</strong>
                          {' '}· +{fmtMontant(apresPoint.entrees)} F entrées
                          {apresPoint.sorties > 0 && <> · −{fmtMontant(apresPoint.sorties)} F sorties</>}
                          {' '}→ attendu final : compté {fmtMontant(pointAttente.montantCompte + apresPoint.entrees - apresPoint.sorties)} F
                        </span>
                      )}
                    </Alert>
                  )}
                  {!controleur && session.statut === 'en_cloture' && (
                    <Alert variant="warning" className="mt-3 mb-0 py-2">
                      <i className="bi bi-hourglass-split me-2"></i>
                      Votre point journalier est en attente de validation par le propriétaire.
                    </Alert>
                  )}
                </>
              )}
            </Card.Body>
          </Card>

          {/* ============ Onglets ============ */}
          <Nav variant="tabs" activeKey={onglet} onSelect={(k) => setOnglet(k as any)} className="mb-3">
            <Nav.Item><Nav.Link eventKey="remises">
              Remises {remises.filter((r) => r.statut === 'declaree').length > 0 && (
                <Badge bg="warning" text="dark" className="ms-1">
                  {remises.filter((r) => r.statut === 'declaree').length}
                </Badge>
              )}
            </Nav.Link></Nav.Item>
            {controleur && (
              <>
                <Nav.Item><Nav.Link eventKey="sessions">Sessions</Nav.Link></Nav.Item>
              </>
            )}
          </Nav>

          {onglet === 'remises' && (
            <Card className="shadow-sm">
              <Table responsive hover className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>N°</th><th>Date</th><th>Déclarée par</th>
                    <th className="text-end">Montant</th><th>Statut</th>
                    {controleur && <th className="text-end">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {remises.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted py-4">Aucune remise</td></tr>
                  )}
                  {remises.map((r) => (
                    <tr key={r._id}>
                      <td className="fw-semibold">{r.numero}</td>
                      <td>{fmtHeure(r.dateDeclaration)}</td>
                      <td>{r.declareeParNom}</td>
                      <td className="text-end">{fmtMontant(r.montant)} F</td>
                      <td>
                        <Badge bg={STATUTS_REMISE[r.statut].color}>{STATUTS_REMISE[r.statut].label}</Badge>
                        {r.statut === 'confirmee' && r.confirmeeParNom && (
                          <small className="d-block text-muted">par {r.confirmeeParNom}</small>
                        )}
                        {r.statut === 'annulee' && (
                          <small className="d-block text-muted" title={r.motifAnnulation}>{r.motifAnnulation}</small>
                        )}
                      </td>
                      {controleur && (
                        <td className="text-end">
                          {r.statut === 'declaree' && peutConfirmer && (
                            <>
                              <Button variant="success" size="sm" className="me-1" disabled={enCours}
                                onClick={() => confirmerRemise(r)}>
                                <i className="bi bi-check2"></i>
                              </Button>
                              <Button variant="outline-danger" size="sm" disabled={enCours}
                                onClick={() => setRemiseAAnnuler(r)}>
                                <i className="bi bi-x"></i>
                              </Button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {onglet === 'sessions' && controleur && (
            <Card className="shadow-sm">
              <Table responsive hover className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>N°</th><th>Ouverture</th><th>Par</th>
                    <th className="text-end">Fond</th>
                    <th className="text-end">Solde</th>
                    <th className="text-end">Écart</th>
                    <th>Statut</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {historique.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-muted py-4">Aucune session</td></tr>
                  )}
                  {historique.map((s) => {
                    const ec = s.cloture?.ecart ?? s.pointEnAttente?.ecart;
                    return (
                      <tr key={s._id}>
                        <td className="fw-semibold">{s.numero}</td>
                        <td>{fmtHeure(s.dateOuverture)}</td>
                        <td>{s.ouverteParNom}</td>
                        <td className="text-end">{fmtMontant(s.fondDeCaisse)} F</td>
                        <td className="text-end">{fmtMontant(s.soldeTheorique ?? s.cloture?.soldeTheorique)} F</td>
                        <td className={`text-end ${ec ? (ec < 0 ? 'text-danger' : 'text-warning') : ''}`}>
                          {ec != null ? `${ec >= 0 ? '+' : ''}${fmtMontant(ec)} F` : '—'}
                        </td>
                        <td><Badge bg={STATUTS_SESSION[s.statut].color}>{STATUTS_SESSION[s.statut].label}</Badge></td>
                        <td className="text-end">
                          <Button variant="outline-secondary" size="sm" onClick={() => ouvrirDetail(s)}>
                            <i className="bi bi-eye"></i>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}

          {/* Mouvements de la session courante (contrôleurs) */}
          {controleur && session && mouvements.length > 0 && onglet === 'remises' && (
            <Card className="shadow-sm mt-3">
              <Card.Header className="bg-white fw-semibold">Mouvements de la session</Card.Header>
              <Table responsive size="sm" className="mb-0 align-middle">
                <thead className="table-light">
                  <tr><th>Heure</th><th>Motif</th><th>Par</th><th>Mode</th><th className="text-end">Montant</th></tr>
                </thead>
                <tbody>
                  {mouvements.map((m) => (
                    <tr key={m._id}>
                      <td>{fmtHeure(m.date)}</td>
                      <td>{MOTIFS_MVT[m.motif] || m.motif}</td>
                      <td>{m.userNom}</td>
                      <td>{m.modePaiement || '—'}</td>
                      <td className={`text-end ${m.type === 'entree' ? 'text-success' : 'text-danger'}`}>
                        {m.type === 'entree' ? '+' : '−'}{fmtMontant(m.montant)} F
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* ============ Modale ouverture ============ */}
      <Modal show={showOuverture} onHide={() => setShowOuverture(false)} centered>
        <Modal.Header closeButton><Modal.Title>Ouvrir la caisse — {kiosque?.designation}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Fond de caisse (FCFA)</Form.Label>
            <Form.Control type="number" min={0} value={fond} onChange={(e) => setFond(e.target.value)}
              placeholder="0" autoFocus />
            <Form.Text className="text-muted">Monnaie laissée en caisse à l'ouverture (0 si aucune).</Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowOuverture(false)}>Annuler</Button>
          <Button variant="success" size="sm" disabled={enCours} onClick={ouvrir}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Ouvrir'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale point journalier ============ */}
      <Modal show={showPoint} onHide={() => setShowPoint(false)} centered>
        <Modal.Header closeButton><Modal.Title>Point journalier — {session?.numero}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="light" className="border py-2">
            <i className="bi bi-info-circle me-2"></i>
            Comptez l'argent réellement présent en caisse et saisissez le montant.
            L'écart éventuel est calculé par le système et signalé au propriétaire.
          </Alert>
          <Form.Group className="mb-2">
            <Form.Label>Montant compté en caisse (FCFA) *</Form.Label>
            <Form.Control type="number" min={0} value={compte} onChange={(e) => setCompte(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label>Commentaire</Form.Label>
            <Form.Control as="textarea" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowPoint(false)}>Annuler</Button>
          <Button variant="success" size="sm" disabled={enCours || compte === ''} onClick={pointer}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Déclarer le point'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale clôture ============ */}
      <Modal show={showCloture} onHide={() => setShowCloture(false)} centered>
        <Modal.Header closeButton><Modal.Title>Clôturer — {session?.numero}</Modal.Title></Modal.Header>
        <Modal.Body>
          {pointAttente ? (
            <Alert variant={pointAttente.ecart === 0 ? 'success' : 'warning'} className="py-2">
              Point de {pointAttente.declareParNom} : compté {fmtMontant(pointAttente.montantCompte)} F,
              attendu {fmtMontant(pointAttente.soldeTheorique)} F —{' '}
              <strong>écart {pointAttente.ecart >= 0 ? '+' : ''}{fmtMontant(pointAttente.ecart)} F</strong>
            </Alert>
          ) : (
            <Alert variant="light" className="border py-2">
              Clôture directe sans point déclaré — solde théorique :{' '}
              <strong>{fmtMontant(session?.soldeTheorique)} F</strong>
            </Alert>
          )}
          <Form.Group>
            <Form.Label>Commentaire</Form.Label>
            <Form.Control as="textarea" rows={2} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowCloture(false)}>Annuler</Button>
          <Button variant="success" size="sm" disabled={enCours} onClick={cloturer}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Clôturer définitivement'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale rejet de point ============ */}
      <Modal show={showRejet} onHide={() => setShowRejet(false)} centered>
        <Modal.Header closeButton><Modal.Title>Rejeter le point — {session?.numero}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="py-2">
            La caisse sera rouverte et l'opérateur pourra refaire son comptage.
            La déclaration rejetée reste conservée dans l'historique.
          </Alert>
          <Form.Group>
            <Form.Label>Motif du rejet</Form.Label>
            <Form.Control as="textarea" rows={2} value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)}
              placeholder="Ex : recomptage nécessaire, erreur de saisie…" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowRejet(false)}>Annuler</Button>
          <Button variant="warning" size="sm" disabled={enCours} onClick={rejeter}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Rejeter et rouvrir'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale remise ============ */}
      <Modal show={showRemise} onHide={() => setShowRemise(false)} centered>
        <Modal.Header closeButton><Modal.Title>Déclarer une remise — {kiosque?.designation}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label>Montant remis (FCFA) *</Form.Label>
            <Form.Control type="number" min={1} value={montantRemise} onChange={(e) => setMontantRemise(e.target.value)} autoFocus />
          </Form.Group>
          <Form.Group>
            <Form.Label>Note</Form.Label>
            <Form.Control as="textarea" rows={2} value={noteRemise} onChange={(e) => setNoteRemise(e.target.value)}
              placeholder="Ex : remise de fin de journée" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowRemise(false)}>Annuler</Button>
          <Button variant="primary" size="sm" disabled={enCours || !(Number(montantRemise) > 0)} onClick={declarerRemise}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Déclarer'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale annulation remise ============ */}
      <Modal show={!!remiseAAnnuler} onHide={() => setRemiseAAnnuler(null)} centered>
        <Modal.Header closeButton><Modal.Title>Annuler {remiseAAnnuler?.numero}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Motif d'annulation *</Form.Label>
            <Form.Control as="textarea" rows={2} value={motifAnnulation} onChange={(e) => setMotifAnnulation(e.target.value)} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setRemiseAAnnuler(null)}>Fermer</Button>
          <Button variant="danger" size="sm" disabled={enCours || motifAnnulation.trim().length < 3} onClick={annulerRemise}>
            {enCours ? <Spinner animation="border" size="sm" /> : 'Annuler la remise'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ============ Modale détail session ============ */}
      <Modal show={!!sessionDetail} onHide={() => setSessionDetail(null)} centered size="lg">
        <Modal.Header closeButton><Modal.Title>{sessionDetail?.numero}</Modal.Title></Modal.Header>
        <Modal.Body>
          {sessionDetail && (
            <>
              <Row className="g-2 mb-3 text-center">
                <Col xs={4}><div className="border rounded p-2"><small className="text-muted d-block">Fond</small><strong>{fmtMontant(sessionDetail.fondDeCaisse)} F</strong></div></Col>
                <Col xs={4}><div className="border rounded p-2"><small className="text-muted d-block">Solde théorique</small><strong>{fmtMontant(sessionDetail.soldeTheorique ?? sessionDetail.cloture?.soldeTheorique)} F</strong></div></Col>
                <Col xs={4}><div className="border rounded p-2"><small className="text-muted d-block">Écart</small><strong className={(sessionDetail.cloture?.ecart ?? 0) !== 0 ? 'text-danger' : ''}>{sessionDetail.cloture?.ecart != null ? `${sessionDetail.cloture.ecart >= 0 ? '+' : ''}${fmtMontant(sessionDetail.cloture.ecart)} F` : '—'}</strong></div></Col>
              </Row>
              {(sessionDetail.points?.length ?? 0) > 0 && (
                <>
                  <h6>Points déclarés</h6>
                  <Table size="sm" className="mb-3">
                    <thead className="table-light"><tr><th>Date</th><th>Par</th><th className="text-end">Compté</th><th className="text-end">Attendu</th><th className="text-end">Écart</th><th>Statut</th></tr></thead>
                    <tbody>
                      {sessionDetail.points!.map((p, i) => (
                        <tr key={i}>
                          <td>{fmtHeure(p.datePoint)}</td><td>{p.declareParNom}</td>
                          <td className="text-end">{fmtMontant(p.montantCompte)} F</td>
                          <td className="text-end">{fmtMontant(p.soldeTheorique)} F</td>
                          <td className={`text-end ${p.ecart !== 0 ? 'text-danger' : ''}`}>{p.ecart >= 0 ? '+' : ''}{fmtMontant(p.ecart)} F</td>
                          <td><Badge bg={p.statut === 'valide' ? 'success' : p.statut === 'rejete' ? 'danger' : 'warning'}>{p.statut === 'en_attente' ? 'en attente' : p.statut === 'valide' ? 'validé' : 'rejeté'}</Badge>{p.motifRejet && <small className="d-block text-muted">{p.motifRejet}</small>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
              {sessionDetail.cloture?.dateCloture && (
                <small className="text-muted d-block mb-2">
                  Clôturée par {sessionDetail.cloture.clotureeParNom} le {fmtHeure(sessionDetail.cloture.dateCloture)}
                  {sessionDetail.cloture.commentaire ? ` — ${sessionDetail.cloture.commentaire}` : ''}
                </small>
              )}
              <h6>Mouvements ({mouvements.length})</h6>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                <Table size="sm" className="mb-0">
                  <thead className="table-light"><tr><th>Heure</th><th>Motif</th><th>Par</th><th className="text-end">Montant</th></tr></thead>
                  <tbody>
                    {mouvements.map((m) => (
                      <tr key={m._id}>
                        <td>{fmtHeure(m.date)}</td><td>{MOTIFS_MVT[m.motif] || m.motif}</td><td>{m.userNom}</td>
                        <td className={`text-end ${m.type === 'entree' ? 'text-success' : 'text-danger'}`}>{m.type === 'entree' ? '+' : '−'}{fmtMontant(m.montant)} F</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Modal.Body>
      </Modal>
    </RoleGuard>
  );
}

export default function PageCaisse() {
  return <CaisseInner />;
}
