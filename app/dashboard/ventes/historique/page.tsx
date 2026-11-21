'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, Modal, Pagination, Row, Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useReactToPrint } from 'react-to-print';
import RoleGuard from '@/components/RoleGuard';
import TicketVente from '@/components/ventes/TicketVente';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant, STATUTS_VENTE, STATUTS_PAIEMENT } from '@/lib/format';
import type { ListeVentes, TicketVente as TicketData, VenteDTO } from '@/types/ventes';

interface KiosqueLite { _id: string; code: string; designation: string }

/**
 * Historique des ventes — portée appliquée côté serveur :
 * propriétaire/gestionnaire/comptable → toutes les ventes ;
 * responsable → ses kiosques ; vendeur/caissier → ses ventes uniquement.
 * Une vente validée ne se modifie ni ne se supprime : annulation motivée.
 */
function HistoriqueInner() {
  const { user, aAction } = useAuthUser();
  const [data, setData] = useState<ListeVentes>({ ventes: [], total: 0, page: 1, pages: 1, limit: 20 });
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [chargement, setChargement] = useState(true);

  const [q, setQ] = useState('');
  const [kiosqueId, setKiosqueId] = useState('');
  const [statut, setStatut] = useState('');
  const [typeVente, setTypeVente] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);

  // Détail / ticket / annulation
  const [detail, setDetail] = useState<VenteDTO | null>(null);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const imprimer = useReactToPrint({ contentRef: ticketRef });
  const [showAnnulation, setShowAnnulation] = useState(false);
  const [motif, setMotif] = useState('');
  const [enCours, setEnCours] = useState(false);

  const peutAnnuler = aAction('annuler_vente');
  const voitTout = ['admin', 'gestionnaire', 'comptable'].includes(user?.type || '');

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
  }, []);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (q) params.set('q', q);
    if (kiosqueId) params.set('kiosqueId', kiosqueId);
    if (statut) params.set('statut', statut);
    if (typeVente) params.set('typeVente', typeVente);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    axios
      .get<ListeVentes>(`/api/ventes?${params}`, { withCredentials: true })
      .then((res) => setData(res.data))
      .catch(() => toast.error('Erreur de chargement des ventes'))
      .finally(() => setChargement(false));
  }, [page, q, kiosqueId, statut, typeVente, du, au]);

  useEffect(() => { charger(); }, [charger]);

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
        <a href="/dashboard/ventes" className="btn btn-success btn-sm">
          <i className="bi bi-cart3 me-1"></i>Nouvelle vente
        </a>
      </div>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2">
            <Col md={3}>
              <Form.Control size="sm" placeholder="N° de vente…" value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={kiosqueId} onChange={(e) => { setKiosqueId(e.target.value); setPage(1); }}>
                <option value="">Tous les kiosques</option>
                {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
                <option value="">Tous statuts</option>
                <option value="validee">Validée</option>
                <option value="annulee">Annulée</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={typeVente} onChange={(e) => { setTypeVente(e.target.value); setPage(1); }}>
                <option value="">Comptant + crédit</option>
                <option value="comptant">Comptant</option>
                <option value="credit">Crédit</option>
              </Form.Select>
            </Col>
            <Col md={3} className="d-flex gap-1">
              <Form.Control size="sm" type="date" value={du} onChange={(e) => { setDu(e.target.value); setPage(1); }} />
              <Form.Control size="sm" type="date" value={au} onChange={(e) => { setAu(e.target.value); setPage(1); }} />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        <div className="table-responsive">
          <Table hover size="sm" className="mb-0 align-middle">
            <thead>
              <tr>
                <th>N° vente</th><th>Date</th><th>Kiosque</th><th>Vendeur</th>
                <th>Client</th><th>Type</th><th className="text-end">Total</th>
                <th className="text-end">Payé</th><th>Paiement</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {chargement ? (
                <tr><td colSpan={11} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
              ) : data.ventes.length === 0 ? (
                <tr><td colSpan={11} className="text-center text-muted py-4">Aucune vente</td></tr>
              ) : (
                data.ventes.map((v) => (
                  <tr key={v._id} className={v.statutVente === 'annulee' ? 'table-secondary text-decoration-line-through' : ''}>
                    <td className="fw-semibold">{v.numeroVente}</td>
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
          {peutAnnuler && detail?.statutVente === 'validee' && (
            <Button variant="danger" size="sm" onClick={() => setShowAnnulation(true)}>
              <i className="bi bi-x-octagon me-1"></i>Annuler la vente
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setDetail(null)}>Fermer</Button>
        </Modal.Footer>
      </Modal>

      {/* Modale motif d'annulation */}
      <Modal show={showAnnulation} onHide={() => setShowAnnulation(false)} size="sm" centered>
        <Modal.Header closeButton><Modal.Title>Annuler la vente</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            L'annulation est définitive et tracée : la vente reste dans
            l'historique avec le motif, l'auteur et la date.
          </p>
          <Form.Control
            as="textarea" rows={3} placeholder="Motif de l'annulation *"
            value={motif} onChange={(e) => setMotif(e.target.value)}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowAnnulation(false)}>Retour</Button>
          <Button variant="danger" size="sm" disabled={enCours || motif.trim().length < 3} onClick={annuler}>
            Confirmer l'annulation
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale ticket */}
      <Modal show={!!ticket} onHide={() => setTicket(null)} centered>
        <Modal.Header closeButton><Modal.Title>Ticket</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light">
          {ticket && <TicketVente ref={ticketRef} ticket={ticket} />}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setTicket(null)}>Fermer</Button>
          <Button variant="primary" size="sm" onClick={() => imprimer()}>
            <i className="bi bi-printer me-1"></i>Imprimer
          </Button>
        </Modal.Footer>
      </Modal>
    </RoleGuard>
  );
}

export default function PageHistorique() {
  return <HistoriqueInner />;
}
