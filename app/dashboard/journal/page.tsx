'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, Row, Spinner, Table,
} from 'react-bootstrap';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';

interface Entree {
  _id: string;
  action: string;
  module?: string;
  details?: Record<string, any>;
  ip?: string;
  createdAt: string;
  userId?: { nom?: string; prenom?: string; type?: string } | null;
  kiosqueId?: { nom?: string; code?: string } | null;
}

interface KiosqueLite { _id: string; code: string; nom?: string; designation?: string }

/** Couleur du badge selon la famille d'action. */
function badgePour(action: string): string {
  const a = (action || '').toLowerCase();
  if (a.includes('annul') || a.includes('suppr') || a.includes('suspend')) return 'danger';
  if (a.includes('cloture') || a.includes('modif') || a.includes('rejet')) return 'warning';
  if (a.includes('creat') || a.includes('inscri') || a.includes('ouvert') || a.includes('valid')) return 'success';
  return 'secondary';
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Journal d'activité : audit « qui a fait quoi, quand » pour le
 * propriétaire. Lecture seule, les entrées ne sont jamais modifiables
 * ni supprimables — argument anti-fraude interne.
 */
export default function PageJournal() {
  const [entrees, setEntrees] = useState<Entree[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);

  const [kiosqueId, setKiosqueId] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [page, setPage] = useState(1);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ limit: '50', page: String(page) });
    if (kiosqueId) params.set('kiosqueId', kiosqueId);
    if (module) params.set('module', module);
    if (action) params.set('action', action);
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    axios
      .get(`/api/journal?${params}`, { withCredentials: true })
      .then((res) => {
        setEntrees(res.data.entrees || []);
        setModules(res.data.modules || []);
        setTotal(res.data.total || 0);
        setPages(res.data.pages || 1);
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, [kiosqueId, module, action, du, au, page]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
  }, []);

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'comptable']}>
      <div className="p-3 p-md-4">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 className="mb-0"><i className="bi bi-journal-text me-2" />Journal d&apos;activité</h4>
            <small className="text-muted">Traçabilité des opérations sensibles — {total} entrée(s)</small>
          </div>
          <Button variant="outline-secondary" size="sm" onClick={charger}>
            <i className="bi bi-arrow-clockwise" /> Actualiser
          </Button>
        </div>

        <Card className="mb-3 shadow-sm">
          <Card.Body className="py-2">
            <Row className="g-2 align-items-end">
              <Col md={2}>
                <Form.Label className="mb-1 small">Kiosque</Form.Label>
                <Form.Select size="sm" value={kiosqueId} onChange={(e) => { setKiosqueId(e.target.value); setPage(1); }}>
                  <option value="">Tous</option>
                  {kiosques.map((k) => (
                    <option key={k._id} value={k._id}>{k.nom || k.designation || k.code}</option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Label className="mb-1 small">Module</Form.Label>
                <Form.Select size="sm" value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
                  <option value="">Tous</option>
                  {modules.map((m) => <option key={m} value={m}>{m}</option>)}
                </Form.Select>
              </Col>
              <Col md={2}>
                <Form.Label className="mb-1 small">Action</Form.Label>
                <Form.Control size="sm" value={action} placeholder="ex: annulation" onChange={(e) => { setAction(e.target.value); setPage(1); }} />
              </Col>
              <Col md={2}>
                <Form.Label className="mb-1 small">Du</Form.Label>
                <Form.Control size="sm" type="date" value={du} onChange={(e) => { setDu(e.target.value); setPage(1); }} />
              </Col>
              <Col md={2}>
                <Form.Label className="mb-1 small">Au</Form.Label>
                <Form.Control size="sm" type="date" value={au} onChange={(e) => { setAu(e.target.value); setPage(1); }} />
              </Col>
              <Col md={2}>
                <Button size="sm" variant="outline-dark" className="w-100"
                  onClick={() => { setKiosqueId(''); setModule(''); setAction(''); setDu(''); setAu(''); setPage(1); }}>
                  Réinitialiser
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="shadow-sm">
          <Card.Body className="p-0">
            {chargement ? (
              <div className="text-center py-5"><Spinner animation="border" /></div>
            ) : entrees.length === 0 ? (
              <div className="text-center py-5 text-muted">Aucune entrée pour ces filtres.</div>
            ) : (
              <Table responsive hover className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Date / heure</th>
                    <th>Utilisateur</th>
                    <th>Kiosque</th>
                    <th>Module</th>
                    <th>Action</th>
                    <th style={{ width: 80 }}>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {entrees.map((e) => (
                    <Fragment key={e._id}>
                      <tr>
                        <td className="text-nowrap">{fmtDate(e.createdAt)}</td>
                        <td>
                          {e.userId
                            ? <>{e.userId.prenom} {e.userId.nom} <small className="text-muted">({e.userId.type})</small></>
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>{e.kiosqueId?.nom || e.kiosqueId?.code || <span className="text-muted">—</span>}</td>
                        <td><Badge bg="light" text="dark">{e.module || '—'}</Badge></td>
                        <td><Badge bg={badgePour(e.action)}>{e.action}</Badge></td>
                        <td>
                          {e.details && Object.keys(e.details).length > 0 && (
                            <Button size="sm" variant="link" className="p-0"
                              onClick={() => setOuvert(ouvert === e._id ? null : e._id)}>
                              <i className={`bi bi-chevron-${ouvert === e._id ? 'up' : 'down'}`} />
                            </Button>
                          )}
                        </td>
                      </tr>
                      {ouvert === e._id && (
                        <tr>
                          <td colSpan={6} className="bg-light">
                            <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(e.details, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </Table>
            )}
          </Card.Body>
          {pages > 1 && (
            <Card.Footer className="d-flex justify-content-between align-items-center">
              <small className="text-muted">Page {page} / {pages}</small>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <i className="bi bi-chevron-left" />
                </Button>
                <Button size="sm" variant="outline-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  <i className="bi bi-chevron-right" />
                </Button>
              </div>
            </Card.Footer>
          )}
        </Card>
      </div>
    </RoleGuard>
  );
}
