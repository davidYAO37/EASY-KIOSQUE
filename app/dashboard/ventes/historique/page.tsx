'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, InputGroup, Modal, Pagination, Row, Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import Link from 'next/link';
import { useActualisation, useLecture, useRecherche } from '@/hooks/useLecture';
import { useReactToPrint } from 'react-to-print';
import RoleGuard from '@/components/RoleGuard';
import TicketVente from '@/components/ventes/TicketVente';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant, STATUTS_VENTE, STATUTS_PAIEMENT } from '@/lib/format';
import type { DemandeAnnulationDTO, ListeDemandesAnnulation, ListeVentes, TicketVente as TicketData, VenteDTO } from '@/types/ventes';

interface KiosqueLite { _id: string; code: string; designation: string }

/** Date → valeur d'un input datetime-local (heure locale du navigateur). */
function versLocal(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Valeur du filtre envoyée à l'API : instant exact en ISO (fuseau préservé). */
function versParam(v: string) {
  return v.includes('T') ? new Date(v).toISOString() : v;
}

/**
 * Historique des ventes — portée appliquée côté serveur :
 * propriétaire/gestionnaire/comptable → toutes les ventes ;
 * responsable → ses kiosques ; vendeur/caissier → ses ventes uniquement.
 * Une vente validée ne se modifie ni ne se supprime : annulation motivée.
 */
function HistoriqueInner() {
  const { user, aAction } = useAuthUser();
  const [data, setData] = useState<ListeVentes>({ ventes: [], total: 0, page: 1, pages: 1, limit: 20, recapPaiements: [] });
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [chargement, setChargement] = useState(true);

  const [q, setQ] = useState('');
  const qRecherche = useRecherche(q);
  const lire = useLecture();
  const [kiosqueId, setKiosqueId] = useState('');
  const [statut, setStatut] = useState('');
  const [typeVente, setTypeVente] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  // true quand l'utilisateur a modifié le champ — sinon la valeur par
  // défaut ne doit pas compter comme filtre actif dans le badge.
  const [duTouche, setDuTouche] = useState(false);
  const [auTouche, setAuTouche] = useState(false);
  const [page, setPage] = useState(1);

  // Détail / ticket / annulation
  const [detail, setDetail] = useState<VenteDTO | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const imprimer = useReactToPrint({ contentRef: ticketRef });
  const [showAnnulation, setShowAnnulation] = useState(false);
  const [modeDemande, setModeDemande] = useState(false); // false = annulation directe, true = demande
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);

  // Demandes d'annulation (historisées : demandeur, période, décision)
  const [demandes, setDemandes] = useState<ListeDemandesAnnulation>({ demandes: [], total: 0, page: 1, pages: 1, limit: 10 });
  const [chargementDemandes, setChargementDemandes] = useState(true);
  const [dStatut, setDStatut] = useState('');
  const [dDemandeurId, setDDemandeurId] = useState('');
  const [dDu, setDDu] = useState('');
  const [dAu, setDAu] = useState('');
  const [dPage, setDPage] = useState(1);
  const [demandeurs, setDemandeurs] = useState<{ _id: string; nom: string }[]>([]);
  const [enAttenteVentes, setEnAttenteVentes] = useState<Set<string>>(new Set());
  const [rejet, setRejet] = useState<DemandeAnnulationDTO | null>(null);
  const [motifRejet, setMotifRejet] = useState('');

  const peutAnnuler = aAction('annuler_vente');
  const voitTout = ['admin', 'gestionnaire', 'comptable'].includes(user?.type || '');

  /** Début de période par défaut selon le rôle :
   *  vendeur/caissier → heure de connexion (ses ventes de la session) ;
   *  responsable → début de journée (il supervise tout le kiosque). */
  const debutParDefaut = useCallback(() => {
    if (user?.type === 'responsable') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return user?.connecteDepuis ? new Date(user.connecteDepuis) : new Date();
  }, [user]);

  // Opérateurs : la période par défaut est pré-remplie — modifiable ensuite.
  useEffect(() => {
    if (!user || voitTout || du) return;
    setDu(versLocal(debutParDefaut()));
    setAu(versLocal(new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, voitTout]);

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
  }, []);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (qRecherche) params.set('q', qRecherche);
    if (kiosqueId) params.set('kiosqueId', kiosqueId);
    if (statut) params.set('statut', statut);
    if (typeVente) params.set('typeVente', typeVente);
    if (du) params.set('du', versParam(du));
    if (au) params.set('au', versParam(au));
    void lire<ListeVentes>(`/api/ventes?${params}`, setData,
      () => toast.error('Erreur de chargement des ventes'), () => setChargement(false));
  }, [page, qRecherche, kiosqueId, statut, typeVente, du, au, lire]);

  const filtresActifs = [qRecherche, kiosqueId, statut, typeVente, duTouche && du, auTouche && au].filter(Boolean).length;
  const reinitialiser = () => {
    setQ('');
    setKiosqueId('');
    setStatut('');
    setTypeVente('');
    setDu(voitTout ? '' : versLocal(debutParDefaut()));
    setAu(voitTout ? '' : versLocal(new Date()));
    setDuTouche(false);
    setAuTouche(false);
    setPage(1);
  };

  useActualisation(charger);
  useEffect(() => {
    // Vendeur/caissier/responsable : attendre la période par défaut
    // (connexion → maintenant) avant le premier chargement.
    if (!user || (!voitTout && !du)) return;
    charger();
  }, [charger, user, voitTout, du]);

  // Demandes d'annulation : portée serveur (opérateur = les siennes,
  // validateur/admin = tout le tenant avec filtres demandeur/période).
  const chargerDemandes = useCallback(() => {
    if (!user?.entrepriseId) return;
    setChargementDemandes(true);
    const params = new URLSearchParams({ page: String(dPage), limit: '10' });
    if (dStatut) params.set('statut', dStatut);
    if (dDemandeurId) params.set('demandeurId', dDemandeurId);
    if (dDu) params.set('du', dDu);
    if (dAu) params.set('au', dAu);
    void lire<ListeDemandesAnnulation>(`/api/demandes-annulation?${params}`, setDemandes,
      () => toast.error('Erreur de chargement des demandes'), () => setChargementDemandes(false));
    // Demandes en attente → badge sur les ventes concernées + compteur.
    // Clé distincte : sinon useLecture déduplique par préfixe d'URL et
    // annulerait la requête de liste ci-dessus.
    void lire<ListeDemandesAnnulation>('/api/demandes-annulation?statut=en_attente&limit=100',
      (d) => setEnAttenteVentes(new Set(d.demandes.map((x) => x.venteId))),
      undefined, undefined, '/api/demandes-annulation:en-attente');
  }, [user, dPage, dStatut, dDemandeurId, dDu, dAu, lire]);

  useEffect(() => { chargerDemandes(); }, [chargerDemandes]);

  // Liste des demandeurs pour le filtre (admins/validateurs uniquement)
  useEffect(() => {
    if (!voitTout || !user?.entrepriseId) return;
    axios.get('/api/demandes-annulation?demandeurs=1', { withCredentials: true })
      .then((res) => setDemandeurs(res.data?.demandeurs || []))
      .catch(() => {});
  }, [voitTout, user?.entrepriseId]);

  const demanderAnnulation = async () => {
    if (!detail || motif.trim().length < 3) {
      return toast.warning("Motif obligatoire (3 caractères min.).");
    }
    setEnCours(true);
    try {
      await axios.post(
        `/api/ventes/${detail._id}/demande-annulation`,
        { motif: motif.trim() },
        { withCredentials: true }
      );
      setShowAnnulation(false);
      setMotif('');
      toast.success("Demande d'annulation envoyée au responsable");
      chargerDemandes();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur de demande');
    } finally {
      setEnCours(false);
    }
  };

  const traiter = async (d: DemandeAnnulationDTO, decision: 'valider' | 'rejeter', motifRej?: string) => {
    setEnCours(true);
    try {
      await axios.post(`/api/demandes-annulation/${d._id}`,
        { decision, motifRejet: motifRej }, { withCredentials: true });
      toast.success(decision === 'valider' ? `Vente ${d.numeroVente} annulée` : 'Demande rejetée');
      setRejet(null);
      setMotifRejet('');
      chargerDemandes();
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur de traitement');
    } finally {
      setEnCours(false);
    }
  };

  const ouvrirDetail = async (id: string) => {
    try {
      const res = await axios.get(`/api/ventes/${id}`, { withCredentials: true });
      setDetail(res.data.vente);
    } catch {
      toast.error('Vente introuvable');
    }
  };

  const ouvrirTicket = async (id: string) => {
    try {
      const res = await axios.get(`/api/ventes/${id}/ticket`, { withCredentials: true });
      setTicket(res.data.ticket);
    } catch {
      toast.error('Ticket indisponible');
    }
  };

  const annuler = async () => {
    if (!detail || motif.trim().length < 3) {
      return toast.warning("Motif d'annulation requis (3 caractères min.).");
    }
    setEnCours(true);
    try {
      const res = await axios.post(
        `/api/ventes/${detail._id}/annulation`,
        { motif: motif.trim() },
        { withCredentials: true }
      );
      setDetail(res.data.vente);
      setShowAnnulation(false);
      setMotif('');
      toast.success(`Vente ${res.data.vente.numeroVente} annulée`);
      charger();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur d'annulation");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'caissier', 'vendeur', 'comptable']}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0"><i className="bi bi-clock-history me-2"></i>
          {voitTout ? 'Historique des ventes' : 'Mes ventes'}
        </h4>
        <Link href="/dashboard/ventes" className="btn btn-success btn-sm">
          <i className="bi bi-cart3 me-1"></i>Nouvelle vente
        </Link>
      </div>

      <Card className="mb-3 shadow-sm">
        <Card.Header className="py-2 bg-white d-flex justify-content-between align-items-center">
          <span className="small fw-semibold text-muted">
            <i className="bi bi-funnel me-1"></i>Filtres
            {filtresActifs > 0 && <Badge bg="primary" pill className="ms-2">{filtresActifs}</Badge>}
          </span>
          {filtresActifs > 0 && (
            <Button size="sm" variant="link" className="p-0 text-decoration-none" onClick={reinitialiser}>
              <i className="bi bi-arrow-counterclockwise me-1"></i>Réinitialiser
            </Button>
          )}
        </Card.Header>
        <Card.Body className="py-3">
          <Row className="g-3 align-items-end">
            <Col lg={4} md={6}>
              <Form.Label className="small text-muted mb-1">Recherche</Form.Label>
              <InputGroup size="sm">
                <InputGroup.Text className="bg-white"><i className="bi bi-search"></i></InputGroup.Text>
                <Form.Control placeholder="N° de vente…" value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }} />
                {q && (
                  <Button variant="outline-secondary" onClick={() => { setQ(''); setPage(1); }} title="Effacer">
                    <i className="bi bi-x-lg"></i>
                  </Button>
                )}
              </InputGroup>
            </Col>
            <Col lg={2} md={6}>
              <Form.Label className="small text-muted mb-1">Kiosque</Form.Label>
              <Form.Select size="sm" value={kiosqueId} onChange={(e) => { setKiosqueId(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
              </Form.Select>
            </Col>
            <Col lg={2} md={6}>
              <Form.Label className="small text-muted mb-1">Statut</Form.Label>
              <Form.Select size="sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                <option value="validee">Validée</option>
                <option value="annulee">Annulée</option>
              </Form.Select>
            </Col>
            <Col lg={2} md={6}>
              <Form.Label className="small text-muted mb-1">Type</Form.Label>
              <Form.Select size="sm" value={typeVente} onChange={(e) => { setTypeVente(e.target.value); setPage(1); }}>
                <option value="">Tous</option>
                <option value="comptant">Comptant</option>
                <option value="credit">Crédit</option>
              </Form.Select>
            </Col>
            <Col lg={2} md={6}>
              <Form.Label className="small text-muted mb-1">Du</Form.Label>
              <Form.Control size="sm" type="datetime-local" value={du}
                onChange={(e) => { setDu(e.target.value); setDuTouche(true); setPage(1); }} />
            </Col>
            <Col lg={2} md={6}>
              <Form.Label className="small text-muted mb-1">Au</Form.Label>
              <InputGroup size="sm">
                <Form.Control type="datetime-local" value={au}
                  onChange={(e) => { setAu(e.target.value); setAuTouche(true); setPage(1); }} />
                <Button variant="outline-secondary" title="Fin = maintenant"
                  onClick={() => { setAu(versLocal(new Date())); setAuTouche(true); setPage(1); }}>
                  <i className="bi bi-clock"></i>
                </Button>
              </InputGroup>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {(data.recapPaiements || []).length > 0 && (
        <Card className="mb-3">
          <Card.Body className="py-2 d-flex flex-wrap align-items-center gap-2">
            <span className="small fw-semibold me-1">Encaissé par mode :</span>
            {data.recapPaiements!.map((r) => (
              <Badge key={r.mode} bg="light" text="dark" className="border">
                {r.mode} : {fmtMontant(r.montant)} F <span className="text-muted">({r.nombre})</span>
              </Badge>
            ))}
            <Badge bg="success">
              Total : {fmtMontant(data.recapPaiements!.reduce((s, r) => s + r.montant, 0))} F
            </Badge>
          </Card.Body>
        </Card>
      )}

      <Card className="shadow-sm">
        <Card.Header className="py-2 bg-white d-flex justify-content-between align-items-center">
          <span className="small fw-semibold text-muted">
            <i className="bi bi-receipt me-1"></i>
            {data.total} vente{data.total > 1 ? 's' : ''}
          </span>
          {chargement && <Spinner animation="border" size="sm" />}
        </Card.Header>
        <div className="table-responsive">
          <Table hover size="sm" className="mb-0 align-middle" aria-busy={chargement}>
            <thead>
              <tr>
                <th>N° vente</th><th>Date</th><th>Kiosque</th><th>Vendeur</th>
                <th>Client</th><th>Type</th><th className="text-end">Total</th>
                <th className="text-end">Payé</th><th>Paiement</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {chargement && data.ventes.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
              ) : data.ventes.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-muted py-4">Aucune vente</td></tr>
              ) : (
                data.ventes.map((v) => (
                  <tr key={v._id} className={v.statutVente === 'annulee' ? 'table-secondary text-decoration-line-through' : ''}>
                    <td className="fw-semibold">
                      {v.numeroVente}
                      {enAttenteVentes.has(v._id) && (
                        <Badge bg="warning" text="dark" className="ms-1">Annulation demandée</Badge>
                      )}
                    </td>
                    <td>{v.dateVente ? new Date(v.dateVente).toLocaleString('fr-FR') : ''}</td>
                    <td>{v.kiosque?.designation || '—'}</td>
                    <td>{v.vendeurNom || '—'}</td>
                    <td>{v.clientNom || '—'}</td>
                    <td>
                      <Badge bg={v.typeVente === 'credit' ? 'warning' : 'info'} text="dark">
                        {v.typeVente === 'credit' ? 'Crédit' : 'Comptant'}
                      </Badge>
                    </td>
                    <td className="text-end fw-semibold">{fmtMontant(v.montantTotal)}</td>
                    <td className="text-end">{fmtMontant(v.montantPaye)}</td>
                    <td>
                      <Badge bg={STATUTS_PAIEMENT[v.statutPaiement]?.color || 'secondary'}>
                        {STATUTS_PAIEMENT[v.statutPaiement]?.label || v.statutPaiement}
                      </Badge>
                    </td>
                    <td>
                      <Badge bg={STATUTS_VENTE[v.statutVente]?.color || 'secondary'}>
                        {STATUTS_VENTE[v.statutVente]?.label || v.statutVente}
                      </Badge>
                    </td>
                    <td className="text-nowrap">
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrirDetail(v._id)} title="Détail">
                        <i className="bi bi-eye"></i>
                      </Button>
                      <Button size="sm" variant="outline-secondary" onClick={() => ouvrirTicket(v._id)} title="Ticket">
                        <i className="bi bi-printer"></i>
                      </Button>
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

      {/* Demandes d'annulation — historisées (demandeur, période, décision) */}
      <Card className="shadow-sm mt-3">
        <Card.Header className="py-2 bg-white d-flex justify-content-between align-items-center">
          <span className="small fw-semibold text-muted">
            <i className="bi bi-inbox me-1"></i>
            {voitTout ? "Demandes d'annulation" : 'Mes demandes d\'annulation'}
            {enAttenteVentes.size > 0 && <Badge bg="warning" text="dark" pill className="ms-2">{enAttenteVentes.size} en attente</Badge>}
          </span>
          {chargementDemandes && <Spinner animation="border" size="sm" />}
        </Card.Header>
        <Card.Body className="py-2">
          <Row className="g-2 align-items-end">
            <Col md={3}>
              <Form.Label className="small text-muted mb-1">Statut</Form.Label>
              <Form.Select size="sm" value={dStatut} onChange={(e) => { setDStatut(e.target.value); setDPage(1); }}>
                <option value="">Tous</option>
                <option value="en_attente">En attente</option>
                <option value="approuvee">Approuvée</option>
                <option value="rejetee">Rejetée</option>
              </Form.Select>
            </Col>
            {voitTout && (
              <Col md={3}>
                <Form.Label className="small text-muted mb-1">Demandeur</Form.Label>
                <Form.Select size="sm" value={dDemandeurId} onChange={(e) => { setDDemandeurId(e.target.value); setDPage(1); }}>
                  <option value="">Tous</option>
                  {demandeurs.map((d) => <option key={d._id} value={d._id}>{d.nom}</option>)}
                </Form.Select>
              </Col>
            )}
            <Col md={3}>
              <Form.Label className="small text-muted mb-1">Du</Form.Label>
              <Form.Control size="sm" type="date" value={dDu} onChange={(e) => { setDDu(e.target.value); setDPage(1); }} />
            </Col>
            <Col md={3}>
              <Form.Label className="small text-muted mb-1">Au</Form.Label>
              <Form.Control size="sm" type="date" value={dAu} onChange={(e) => { setDAu(e.target.value); setDPage(1); }} />
            </Col>
          </Row>
        </Card.Body>
        <div className="table-responsive">
          <Table hover size="sm" className="mb-0 align-middle" aria-busy={chargementDemandes}>
            <thead>
              <tr>
                <th>Demande</th><th>Vente</th>{voitTout && <th>Demandeur</th>}<th>Motif</th>
                <th className="text-end">Montant</th><th>Statut</th><th>Traitement</th>
                {peutAnnuler && <th></th>}
              </tr>
            </thead>
            <tbody>
              {chargementDemandes && demandes.demandes.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
              ) : demandes.demandes.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted py-4">Aucune demande</td></tr>
              ) : (
                demandes.demandes.map((d) => (
                  <tr key={d._id}>
                    <td className="text-nowrap small">
                      {d.createdAt ? new Date(d.createdAt).toLocaleString('fr-FR') : ''}
                    </td>
                    <td className="fw-semibold">{d.numeroVente}</td>
                    {voitTout && <td>{d.demandeurNom}</td>}
                    <td className="small text-muted" style={{ maxWidth: 220 }}>{d.motif}</td>
                    <td className="text-end">{fmtMontant(d.montantTotal)} F</td>
                    <td>
                      <Badge bg={d.statut === 'en_attente' ? 'warning' : d.statut === 'approuvee' ? 'success' : 'danger'}
                        text={d.statut === 'en_attente' ? 'dark' : undefined}>
                        {d.statut === 'en_attente' ? 'En attente' : d.statut === 'approuvee' ? 'Approuvée' : 'Rejetée'}
                      </Badge>
                    </td>
                    <td className="small text-muted">
                      {d.traiteLe
                        ? `${d.traiteParNom || ''} · ${new Date(d.traiteLe).toLocaleString('fr-FR')}${d.motifRejet ? ` — ${d.motifRejet}` : ''}`
                        : '—'}
                    </td>
                    {peutAnnuler && (
                      <td className="text-nowrap">
                        {d.statut === 'en_attente' && (
                          <>
                            <Button size="sm" variant="success" className="me-1" disabled={enCours}
                              onClick={() => traiter(d, 'valider')} title="Valider : annule la vente">
                              <i className="bi bi-check-lg"></i>
                            </Button>
                            <Button size="sm" variant="outline-danger" disabled={enCours}
                              onClick={() => setRejet(d)} title="Rejeter la demande">
                              <i className="bi bi-x-lg"></i>
                            </Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
        {demandes.pages > 1 && (
          <Card.Footer>
            <Pagination size="sm" className="mb-0 justify-content-center">
              <Pagination.Prev disabled={dPage <= 1} onClick={() => setDPage(dPage - 1)} />
              <Pagination.Item disabled>{dPage} / {demandes.pages}</Pagination.Item>
              <Pagination.Next disabled={dPage >= demandes.pages} onClick={() => setDPage(dPage + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>

      {/* Modale motif de rejet */}
      <Modal show={!!rejet} onHide={() => setRejet(null)} size="sm" centered>
        <Modal.Header closeButton><Modal.Title>Rejeter la demande</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            La vente {rejet?.numeroVente} restera validée. Le motif du rejet est historisé
            et visible par le demandeur.
          </p>
          <Form.Control
            as="textarea" rows={3} placeholder="Motif du rejet *"
            value={motifRejet} onChange={(e) => setMotifRejet(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setRejet(null)}>Retour</Button>
          <Button variant="danger" size="sm" disabled={enCours || motifRejet.trim().length < 3}
            onClick={() => rejet && traiter(rejet, 'rejeter', motifRejet.trim())}>
            Confirmer le rejet
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale détail */}
      <Modal show={!!detail} onHide={() => setDetail(null)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Vente {detail?.numeroVente}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detail && (
            <>
              <Row className="small mb-3">
                <Col md={4}><strong>Date :</strong> {detail.dateVente ? new Date(detail.dateVente).toLocaleString('fr-FR') : ''}</Col>
                <Col md={4}><strong>Kiosque :</strong> {detail.kiosque?.designation}</Col>
                <Col md={4}><strong>Vendeur :</strong> {detail.vendeurNom}</Col>
                <Col md={4}><strong>Client :</strong> {detail.clientNom || 'De passage'}</Col>
                <Col md={4}><strong>Type :</strong> {detail.typeVente === 'credit' ? 'Crédit' : 'Comptant'}</Col>
                <Col md={4}>
                  <strong>Statut :</strong>{' '}
                  <Badge bg={STATUTS_VENTE[detail.statutVente]?.color}>{STATUTS_VENTE[detail.statutVente]?.label}</Badge>
                </Col>
              </Row>

              {detail.statutVente === 'annulee' && detail.annulation && (
                <div className="alert alert-danger py-2 small">
                  Annulée le {new Date(detail.annulation.annuleeLe).toLocaleString('fr-FR')} par{' '}
                  {detail.annulation.annuleeParNom} — motif : {detail.annulation.motif}
                </div>
              )}

              <Table size="sm" bordered>
                <thead><tr><th>Produit</th><th className="text-center">Qté</th><th className="text-end">PU</th><th className="text-end">Montant</th></tr></thead>
                <tbody>
                  {(detail.lignes || []).map((l, i) => (
                    <tr key={i}>
                      <td>{l.designation} <span className="text-muted">({l.code})</span></td>
                      <td className="text-center">{l.quantite}</td>
                      <td className="text-end">{fmtMontant(l.prixUnitaire)}</td>
                      <td className="text-end">{fmtMontant(l.montant)}</td>
                    </tr>
                  ))}
                  <tr className="fw-bold">
                    <td colSpan={3}>TOTAL</td>
                    <td className="text-end">{fmtMontant(detail.montantTotal)} F</td>
                  </tr>
                </tbody>
              </Table>

              {(detail.paiements || []).length > 0 && (
                <>
                  <div className="fw-semibold small mb-1">Encaissements</div>
                  <Table size="sm" bordered>
                    <thead><tr><th>Mode</th><th className="text-end">Montant</th><th>Reçu par</th><th>Statut</th></tr></thead>
                    <tbody>
                      {detail.paiements!.map((p, i) => (
                        <tr key={i} className={p.statut === 'annule' ? 'text-decoration-line-through text-muted' : ''}>
                          <td>{p.mode}</td>
                          <td className="text-end">{fmtMontant(p.montant)} F</td>
                          <td>{p.recuParNom}</td>
                          <td>{p.statut === 'annule' ? 'Annulé' : 'Validé'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
              {detail.resteAPayer > 0 && detail.statutVente !== 'annulee' && (
                <div className="alert alert-warning py-2 small mb-0">
                  Reste à payer : <strong>{fmtMontant(detail.resteAPayer)} F</strong>
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {detail?.statutVente === 'validee' && detail.caisseVerrouillee && (
            <Badge bg="secondary" className="me-auto">
              <i className="bi bi-lock me-1"></i>Caisse pointée ou clôturée — annulation impossible
            </Badge>
          )}
          {detail?.statutVente === 'validee' && !detail.caisseVerrouillee && !enAttenteVentes.has(detail._id) && (
            peutAnnuler ? (
              <Button variant="danger" size="sm" onClick={() => { setModeDemande(false); setShowAnnulation(true); }}>
                <i className="bi bi-x-octagon me-1"></i>Annuler la vente
              </Button>
            ) : (
              <Button variant="outline-danger" size="sm" onClick={() => { setModeDemande(true); setShowAnnulation(true); }}>
                <i className="bi bi-send me-1"></i>Demander l'annulation
              </Button>
            )
          )}
          {detail && enAttenteVentes.has(detail._id) && (
            <Badge bg="warning" text="dark" className="me-auto">Annulation déjà demandée — en attente de décision</Badge>
          )}
          <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>Fermer</Button>
        </Modal.Footer>
      </Modal>

      {/* Modale motif : annulation directe (validateur) ou demande (opérateur) */}
      <Modal show={showAnnulation} onHide={() => setShowAnnulation(false)} size="sm" centered>
        <Modal.Header closeButton>
          <Modal.Title>{modeDemande ? "Demander l'annulation" : 'Annuler la vente'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            {modeDemande
              ? "La demande sera transmise à un responsable qui validera ou rejettera. La vente reste active en attendant."
              : "L'annulation est définitive et tracée : la vente reste dans l'historique avec le motif, l'auteur et la date."}
          </p>
          <Form.Control
            as="textarea" rows={3} placeholder="Motif de l'annulation *"
            value={motif} onChange={(e) => setMotif(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowAnnulation(false)}>Retour</Button>
          <Button variant={modeDemande ? 'primary' : 'danger'} size="sm"
            disabled={enCours || motif.trim().length < 3}
            onClick={modeDemande ? demanderAnnulation : annuler}>
            {modeDemande ? 'Envoyer la demande' : "Confirmer l'annulation"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale ticket */}
      <Modal show={!!ticket} onHide={() => setTicket(null)} centered>
        <Modal.Header closeButton><Modal.Title>Ticket</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light">
          {ticket && <TicketVente ref={ticketRef} ticket={ticket} />}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <span className="text-muted small">
            {ticket?.imprimable === false && (
              <><i className="bi bi-lock me-1"></i>Caisse clôturée — réimpression verrouillée.</>
            )}
          </span>
          <div>
            <Button variant="secondary" size="sm" className="me-2" onClick={() => setTicket(null)}>Fermer</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => imprimer()}
              disabled={ticket?.imprimable === false}
              title={ticket?.imprimable === false ? 'Caisse clôturée — ticket consultable uniquement' : undefined}
            >
              <i className="bi bi-printer me-1"></i>Imprimer
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </RoleGuard>
  );
}

export default function PageHistorique() {
  return <HistoriqueInner />;
}
