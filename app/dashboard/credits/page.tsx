'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Modal, Nav, Pagination, Row,
  Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useReactToPrint } from 'react-to-print';
import RoleGuard from '@/components/RoleGuard';
import RecuRemboursement from '@/components/ventes/RecuRemboursement';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useKiosque } from '@/hooks/useKiosque';
import { fmtMontant, fmtDate, MODES_PAIEMENT, STATUTS_CREANCE } from '@/lib/format';
import type { ClientDTO } from '@/types/ventes';
import type {
  CreanceDTO, ListeCreances, ListeRemboursements,
  RecuRemboursement as RecuData, RemboursementDTO,
} from '@/types/credits';

interface KiosqueLite { _id: string; code: string; designation: string }

/**
 * Écran de suivi des créances : liste par client/kiosque/période,
 * encaissement (total, partiel, multi-ventes), historique des
 * remboursements et impression de reçu.
 */
function CreditsInner() {
  const { aAction } = useAuthUser();
  const { kiosqueId: kiosqueCourant } = useKiosque();
  const peutEncaisser = aAction('enregistrer_remboursement');

  const [onglet, setOnglet] = useState<'creances' | 'remboursements'>('creances');
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);

  // Créances
  const [creances, setCreances] = useState<ListeCreances>({ creances: [], total: 0, page: 1, pages: 1, limit: 20, totalDu: 0 });
  const [chargementC, setChargementC] = useState(true);
  const [fStatut, setFStatut] = useState('');
  const [fKiosque, setFKiosque] = useState('');
  const [fClient, setFClient] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);

  // Remboursements
  const [rmbs, setRmbs] = useState<ListeRemboursements>({ remboursements: [], total: 0, page: 1, pages: 1, limit: 20 });
  const [chargementR, setChargementR] = useState(false);
  const [pageR, setPageR] = useState(1);

  // Encaissement
  const [showEnc, setShowEnc] = useState(false);
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [rechClient, setRechClient] = useState('');
  const [clientSel, setClientSel] = useState<ClientDTO | null>(null);
  const [creancesClient, setCreancesClient] = useState<CreanceDTO[]>([]);
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<string>('Espèces');
  const [reference, setReference] = useState('');
  const [ventilation, setVentilation] = useState<Record<string, string>>({});
  const [manuel, setManuel] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const cleIdempotence = useRef<string>(crypto.randomUUID());

  // Reçu
  const [recu, setRecu] = useState<RecuData | null>(null);
  const recuRef = useRef<HTMLDivElement>(null);
  const imprimer = useReactToPrint({ contentRef: recuRef });

  const soldeClient = useMemo(
    () => creancesClient.reduce((s, c) => s + c.solde, 0),
    [creancesClient]
  );

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
    // Liste des clients pour les filtres (le sélecteur encaissement recharge)
    axios.get('/api/clients?recherche=1', { withCredentials: true })
      .then((res) => setClients(res.data?.clients || []))
      .catch(() => {});
  }, []);

  const chargerCreances = useCallback(() => {
    setChargementC(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (fStatut) params.set('statut', fStatut);
    if (fKiosque) params.set('kiosqueId', fKiosque);
    if (fClient) params.set('clientId', fClient);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    axios.get<ListeCreances>(`/api/credits?${params}`, { withCredentials: true })
      .then((res) => setCreances(res.data))
      .catch((e) => {
        if (e?.response?.status !== 403) toast.error('Erreur de chargement des créances');
      })
      .finally(() => setChargementC(false));
  }, [page, fStatut, fKiosque, fClient, du, au]);

  const chargerRmb = useCallback(() => {
    setChargementR(true);
    const params = new URLSearchParams({ page: String(pageR), limit: '20' });
    if (fKiosque) params.set('kiosqueId', fKiosque);
    if (fClient) params.set('clientId', fClient);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    axios.get<ListeRemboursements>(`/api/remboursements?${params}`, { withCredentials: true })
      .then((res) => setRmbs(res.data))
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setChargementR(false));
  }, [pageR, fKiosque, fClient, du, au]);

  useEffect(() => { if (onglet === 'creances') chargerCreances(); }, [chargerCreances, onglet]);
  useEffect(() => { if (onglet === 'remboursements') chargerRmb(); }, [chargerRmb, onglet]);

  // Recherche clients (encaissement)
  useEffect(() => {
    if (!showEnc) return;
    const t = setTimeout(() => {
      axios.get(`/api/clients?recherche=1&q=${encodeURIComponent(rechClient)}`, { withCredentials: true })
        .then((res) => setClients(res.data?.clients || []))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [rechClient, showEnc]);

  const choisirClient = async (c: ClientDTO) => {
    setClientSel(c);
    setVentilation({});
    setManuel(false);
    const res = await axios.get(`/api/credits?clientId=${c._id}&limit=100`, { withCredentials: true });
    setCreancesClient((res.data?.creances || []).filter((x: CreanceDTO) => x.solde > 0));
  };

  const montantNum = Number(montant) || 0;

  // Ventilation explicite : si modifiée manuellement, elle doit égaler le montant
  const sommeVentilation = Object.values(ventilation).reduce((s, v) => s + (Number(v) || 0), 0);
  const ventilationOk = !manuel || sommeVentilation === montantNum;

  const encaisser = async () => {
    if (!clientSel) return toast.warning('Sélectionnez un client.');
    if (!kiosqueCourant) return toast.warning('Aucun kiosque actif.');
    if (montantNum <= 0) return toast.warning('Montant invalide.');
    if (montantNum > soldeClient) return toast.warning(`Montant supérieur au solde dû (${fmtMontant(soldeClient)} F).`);
    if (!ventilationOk) return toast.warning(`La ventilation (${fmtMontant(sommeVentilation)} F) ne correspond pas au montant (${fmtMontant(montantNum)} F).`);
    if (enCours) return;
    setEnCours(true);
    try {
      const body: any = {
        kiosqueId: kiosqueCourant,
        clientId: clientSel._id,
        montant: montantNum,
        mode,
        reference: reference || undefined,
        idempotencyKey: cleIdempotence.current,
      };
      if (manuel) {
        body.allocations = Object.entries(ventilation)
          .filter(([, v]) => Number(v) > 0)
          .map(([creanceId, v]) => ({ creanceId, montant: Number(v) }));
      }
      const res = await axios.post('/api/remboursements', body, { withCredentials: true });
      toast.success(`Remboursement ${res.data.remboursement.numero} enregistré`);
      const r = await axios.get(`/api/remboursements/${res.data.remboursement._id}/recu`, { withCredentials: true });
      setRecu(r.data.recu);
      setShowEnc(false);
      setClientSel(null);
      setMontant('');
      setReference('');
      cleIdempotence.current = crypto.randomUUID();
      chargerCreances();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur');
    } finally {
      setEnCours(false);
    }
  };

  const ouvrirRecu = async (id: string) => {
    try {
      const res = await axios.get(`/api/remboursements/${id}/recu`, { withCredentials: true });
      setRecu(res.data.recu);
    } catch {
      toast.error('Reçu indisponible');
    }
  };

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'caissier', 'comptable']} allowedActions={['consulter_credits']}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">
          <i className="bi bi-credit-card me-2"></i>Crédits clients
          <Badge bg="danger" className="ms-2">Dû : {fmtMontant(creances.totalDu)} F</Badge>
        </h4>
        {peutEncaisser && (
          <Button size="sm" variant="success" onClick={() => setShowEnc(true)}>
            <i className="bi bi-cash-coin me-1"></i>Encaisser un remboursement
          </Button>
        )}
      </div>

      <Nav variant="tabs" className="mb-3" activeKey={onglet} onSelect={(k) => setOnglet(k as any)}>
        <Nav.Item><Nav.Link eventKey="creances">Créances ({creances.total})</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="remboursements">Remboursements ({rmbs.total})</Nav.Link></Nav.Item>
      </Nav>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2">
            <Col md={3}>
              <Form.Select size="sm" value={fClient} onChange={(e) => { setFClient(e.target.value); setPage(1); setPageR(1); }}>
                <option value="">Tous les clients</option>
                {clients.map((c) => <option key={c._id} value={c._id}>{c.nom} {c.prenoms}</option>)}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={fKiosque} onChange={(e) => { setFKiosque(e.target.value); setPage(1); setPageR(1); }}>
                <option value="">Tous kiosques</option>
                {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
              </Form.Select>
            </Col>
            {onglet === 'creances' && (
              <Col md={3}>
                <Form.Select size="sm" value={fStatut} onChange={(e) => { setFStatut(e.target.value); setPage(1); }}>
                  <option value="">Tous statuts</option>
                  <option value="non_paye">Non payé</option>
                  <option value="partielle">Partiellement payé</option>
                  <option value="soldee">Soldé</option>
                  <option value="annulee">Annulé</option>
                </Form.Select>
              </Col>
            )}
            <Col md={4} className="d-flex gap-1">
              <Form.Control size="sm" type="date" value={du} onChange={(e) => { setDu(e.target.value); setPage(1); setPageR(1); }} />
              <Form.Control size="sm" type="date" value={au} onChange={(e) => { setAu(e.target.value); setPage(1); setPageR(1); }} />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {onglet === 'creances' && (
        <Card>
          <div className="table-responsive">
            <Table hover size="sm" className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>Client</th><th>N° vente</th><th>Date vente</th><th>Kiosque</th>
                  <th className="text-end">Montant</th><th className="text-end">Payé</th>
                  <th className="text-end">Solde</th><th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {chargementC ? (
                  <tr><td colSpan={8} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
                ) : creances.creances.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted py-4">Aucune créance</td></tr>
                ) : (
                  creances.creances.map((c) => (
                    <tr key={c._id}>
                      <td className="fw-semibold">{c.client?.nom} {c.client?.prenoms || ''} <span className="text-muted small">({c.client?.code})</span></td>
                      <td>{c.numeroVente}</td>
                      <td>{fmtDate(c.dateVente)}</td>
                      <td>{c.kiosque?.designation || '—'}</td>
                      <td className="text-end">{fmtMontant(c.montantInitial)}</td>
                      <td className="text-end">{fmtMontant(c.montantPaye)}</td>
                      <td className="text-end fw-bold">{fmtMontant(c.solde)}</td>
                      <td><Badge bg={STATUTS_CREANCE[c.statut]?.color}>{STATUTS_CREANCE[c.statut]?.label}</Badge></td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          {creances.pages > 1 && (
            <Card.Footer>
              <Pagination size="sm" className="mb-0 justify-content-center">
                <Pagination.Prev disabled={page <= 1} onClick={() => setPage(page - 1)} />
                <Pagination.Item disabled>{page} / {creances.pages}</Pagination.Item>
                <Pagination.Next disabled={page >= creances.pages} onClick={() => setPage(page + 1)} />
              </Pagination>
            </Card.Footer>
          )}
        </Card>
      )}

      {onglet === 'remboursements' && (
        <Card>
          <div className="table-responsive">
            <Table hover size="sm" className="mb-0 align-middle">
              <thead>
                <tr>
                  <th>N°</th><th>Date</th><th>Client</th><th>Kiosque</th><th>Mode</th>
                  <th className="text-end">Montant</th><th>Reçu par</th><th></th>
                </tr>
              </thead>
              <tbody>
                {chargementR ? (
                  <tr><td colSpan={8} className="text-center py-4"><Spinner animation="border" size="sm" /></td></tr>
                ) : rmbs.remboursements.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted py-4">Aucun remboursement</td></tr>
                ) : (
                  rmbs.remboursements.map((r) => (
                    <tr key={r._id}>
                      <td className="fw-semibold">{r.numero}</td>
                      <td>{r.datePaiement ? new Date(r.datePaiement).toLocaleString('fr-FR') : ''}</td>
                      <td>{r.clientNom}</td>
                      <td>{r.kiosque?.designation || '—'}</td>
                      <td>{r.mode}</td>
                      <td className="text-end fw-semibold">{fmtMontant(r.montantTotal)}</td>
                      <td>{r.recuParNom}</td>
                      <td>
                        <Button size="sm" variant="outline-secondary" onClick={() => ouvrirRecu(r._id)} title="Reçu">
                          <i className="bi bi-printer"></i>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
          {rmbs.pages > 1 && (
            <Card.Footer>
              <Pagination size="sm" className="mb-0 justify-content-center">
                <Pagination.Prev disabled={pageR <= 1} onClick={() => setPageR(pageR - 1)} />
                <Pagination.Item disabled>{pageR} / {rmbs.pages}</Pagination.Item>
                <Pagination.Next disabled={pageR >= rmbs.pages} onClick={() => setPageR(pageR + 1)} />
              </Pagination>
            </Card.Footer>
          )}
        </Card>
      )}

      {/* Modale encaissement */}
      <Modal show={showEnc} onHide={() => setShowEnc(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title>Encaisser un remboursement</Modal.Title></Modal.Header>
        <Modal.Body>
          <Row className="g-2 mb-3">
            <Col md={8}>
              <Form.Label className="small fw-semibold">Client *</Form.Label>
              <Form.Control
                size="sm"
                placeholder="Rechercher un client avec créance…"
                value={rechClient}
                onChange={(e) => setRechClient(e.target.value)}
              />
              {clients.length > 0 && !clientSel && (
                <div className="border rounded mt-1" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {clients.map((c) => (
                    <button
                      key={c._id}
                      className="btn btn-sm btn-light w-100 text-start"
                      onClick={() => choisirClient(c)}
                    >
                      {c.code} · {c.nom} {c.prenoms || ''}
                      <Badge bg="danger" className="ms-2">{fmtMontant(c.soldeDu)} F</Badge>
                    </button>
                  ))}
                </div>
              )}
            </Col>
            <Col md={4}>
              {clientSel && (
                <Alert variant="info" className="py-2 mb-0 small">
                  <strong>{clientSel.nom} {clientSel.prenoms}</strong>
                  <div>Solde dû : <strong>{fmtMontant(soldeClient)} F</strong></div>
                  <Button variant="link" size="sm" className="p-0" onClick={() => { setClientSel(null); setCreancesClient([]); }}>
                    Changer
                  </Button>
                </Alert>
              )}
            </Col>
          </Row>

          {clientSel && (
            <>
              <div className="fw-semibold small mb-1">Créances du client</div>
              <Table size="sm" bordered className="mb-3">
                <thead>
                  <tr>
                    <th>N° vente</th><th>Date</th><th className="text-end">Solde</th>
                    {manuel && <th style={{ width: 140 }} className="text-end">Versement</th>}
                  </tr>
                </thead>
                <tbody>
                  {creancesClient.map((c) => (
                    <tr key={c._id}>
                      <td>{c.numeroVente}</td>
                      <td>{fmtDate(c.dateVente)}</td>
                      <td className="text-end">{fmtMontant(c.solde)} F</td>
                      {manuel && (
                        <td>
                          <Form.Control
                            size="sm" type="number" min={0} max={c.solde}
                            value={ventilation[c._id] || ''}
                            onChange={(e) => setVentilation({ ...ventilation, [c._id]: e.target.value })}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Form.Check
                type="checkbox"
                className="small mb-3"
                label="Répartir manuellement entre les ventes (sinon : les plus anciennes d'abord)"
                checked={manuel}
                onChange={(e) => setManuel(e.target.checked)}
              />

              <Row className="g-2">
                <Col md={4}>
                  <Form.Label className="small fw-semibold">Montant *</Form.Label>
                  <InputGroupSmall>
                    <Form.Control
                      size="sm" type="number" min={1} max={soldeClient}
                      value={montant} onChange={(e) => setMontant(e.target.value)}
                    />
                    <Button size="sm" variant="outline-secondary" onClick={() => setMontant(String(soldeClient))}>
                      Tout
                    </Button>
                  </InputGroupSmall>
                </Col>
                <Col md={4}>
                  <Form.Label className="small fw-semibold">Mode</Form.Label>
                  <Form.Select size="sm" value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES_PAIEMENT.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Form.Select>
                </Col>
                <Col md={4}>
                  <Form.Label className="small fw-semibold">Référence</Form.Label>
                  <Form.Control size="sm" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optionnel" />
                </Col>
              </Row>
              {manuel && sommeVentilation !== montantNum && (
                <div className="small text-warning mt-2">
                  Ventilation : {fmtMontant(sommeVentilation)} / {fmtMontant(montantNum)} F
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowEnc(false)}>Annuler</Button>
          <Button variant="success" size="sm" disabled={enCours || !clientSel || montantNum <= 0} onClick={encaisser}>
            {enCours ? <Spinner animation="border" size="sm" /> : <><i className="bi bi-check2 me-1"></i>Encaisser</>}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modale reçu */}
      <Modal show={!!recu} onHide={() => setRecu(null)} centered>
        <Modal.Header closeButton><Modal.Title>Reçu de remboursement</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light">
          {recu && <RecuRemboursement ref={recuRef} recu={recu} />}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setRecu(null)}>Fermer</Button>
          <Button variant="primary" size="sm" onClick={() => imprimer()}>
            <i className="bi bi-printer me-1"></i>Imprimer
          </Button>
        </Modal.Footer>
      </Modal>
    </RoleGuard>
  );
}

function InputGroupSmall({ children }: { children: React.ReactNode }) {
  return <div className="input-group input-group-sm">{children}</div>;
}

export default function PageCredits() {
  return <CreditsInner />;
}
