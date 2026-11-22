'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, ListGroup, Row, Spinner,
} from 'react-bootstrap';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useLecture } from '@/hooks/useLecture';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant } from '@/lib/format';
import type { NotificationDTO } from '@/types/ventes';

interface KiosqueLite { _id: string; code: string; designation: string }

const ICONES: Record<string, { icon: string; bg: string }> = {
  vente: { icon: 'bi-cart-check', bg: 'success' },
  annulation_vente: { icon: 'bi-x-octagon', bg: 'danger' },
  remboursement: { icon: 'bi-cash-coin', bg: 'info' },
  info: { icon: 'bi-info-circle', bg: 'secondary' },
};

/**
 * Centre de notifications du propriétaire : chaque vente validée (ou
 * annulée) génère une notification APRÈS enregistrement en base.
 * Réservé à admin/gestionnaire — l'API renvoie 403 sinon.
 */
export default function PageNotifications() {
  const lire = useLecture();
  const { actualiserNotifications } = useAuthUser();
  const [notifs, setNotifs] = useState<NotificationDTO[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [interdit, setInterdit] = useState(false);

  const [kiosqueId, setKiosqueId] = useState('');
  const [seulementNonLues, setSeulementNonLues] = useState(false);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ limit: '100' });
    if (kiosqueId) params.set('kiosqueId', kiosqueId);
    if (seulementNonLues) params.set('lues', '0');
    if (du) params.set('du', du);
    if (au) params.set('au', au);
    void lire(`/api/notifications?${params}`, (data) => {
      setNotifs(data.notifications || []);
      setNonLues(data.nonLues || 0);
    }, (e) => {
      if (e?.response?.status === 403) setInterdit(true);
      else toast.error('Impossible d’actualiser les notifications');
    }, () => setChargement(false));
  }, [kiosqueId, seulementNonLues, du, au, lire]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
  }, []);

  const marquerLue = async (n: NotificationDTO) => {
    if (n.lue) return;
    try {
      await axios.patch(`/api/notifications/${n._id}`, {}, { withCredentials: true });
      setNotifs((ns) => seulementNonLues ? ns.filter((x) => x._id !== n._id) : ns.map((x) => (x._id === n._id ? { ...x, lue: true } : x)));
      setNonLues((c) => Math.max(0, c - 1));
      actualiserNotifications();
      charger();
    } catch {}
  };

  const toutLire = async () => {
    try {
      await axios.post('/api/notifications/tout-lire', {}, { withCredentials: true });
      setNotifs((ns) => seulementNonLues ? [] : ns.map((n) => ({ ...n, lue: true })));
      setNonLues(0);
      actualiserNotifications();
      charger();
    } catch {}
  };

  if (interdit) {
    return (
      <div className="alert alert-warning">
        Le centre de notifications est réservé au propriétaire et à ses gestionnaires.
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">
          <i className="bi bi-bell me-2"></i>Notifications
          {nonLues > 0 && <Badge bg="danger" className="ms-2">{nonLues} non lue(s)</Badge>}
        </h4>
        {nonLues > 0 && (
          <Button size="sm" variant="outline-secondary" onClick={toutLire}>
            <i className="bi bi-check2-all me-1"></i>Tout marquer lu
          </Button>
        )}
      </div>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2 align-items-center">
            <Col md={3}>
              <Form.Select size="sm" value={kiosqueId} onChange={(e) => setKiosqueId(e.target.value)}>
                <option value="">Tous les kiosques</option>
                {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
              </Form.Select>
            </Col>
            <Col md={3} className="d-flex gap-1">
              <Form.Control size="sm" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
              <Form.Control size="sm" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
            </Col>
            <Col md={4}>
              <Form.Check
                type="checkbox"
                label="Non lues seulement"
                checked={seulementNonLues}
                onChange={(e) => setSeulementNonLues(e.target.checked)}
              />
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Card>
        {chargement && notifs.length === 0 ? (
          <div className="text-center py-5"><Spinner animation="border" /></div>
        ) : notifs.length === 0 ? (
          <div className="text-center text-muted py-5">Aucune notification</div>
        ) : (
          <ListGroup variant="flush">
            {notifs.map((n) => {
              const style = ICONES[n.type] || ICONES.info;
              return (
                <ListGroup.Item
                  key={n._id}
                  action
                  onClick={() => marquerLue(n)}
                  className={n.lue ? '' : 'bg-light'}
                >
                  <div className="d-flex gap-3 align-items-start">
                    <span className={`badge bg-${style.bg} p-2 mt-1`}>
                      <i className={`bi ${style.icon}`}></i>
                    </span>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between">
                        <strong className={n.lue ? 'text-muted' : ''}>{n.titre}</strong>
                        <small className="text-muted">
                          {n.createdAt ? new Date(n.createdAt).toLocaleString('fr-FR') : ''}
                        </small>
                      </div>
                      <div className={n.lue ? 'text-muted' : ''}>{n.message}</div>
                      <div className="small text-muted">
                        {n.kiosqueNom && <span className="me-2"><i className="bi bi-shop me-1"></i>{n.kiosqueNom}</span>}
                        {n.montant != null && <span className="me-2 fw-semibold">{fmtMontant(n.montant)} FCFA</span>}
                        {n.numeroVente && <span className="me-2">N° {n.numeroVente}</span>}
                      </div>
                    </div>
                    {!n.lue && <Badge bg="primary" pill>●</Badge>}
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        )}
      </Card>
    </>
  );
}
