'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, Nav, Row, Spinner, Table,
} from 'react-bootstrap';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant, fmtDate } from '@/lib/format';

interface KiosqueLite { _id: string; code: string; designation: string }
const COULEURS = ['#ea580c', '#14213d', '#f59e0b', '#dc3545', '#fb923c', '#64748b', '#9a3412'];

function aujourdhuiIlYa(jours: number) {
  return new Date(Date.now() - jours * 86400000).toISOString().slice(0, 10);
}

/**
 * Rapports — ventes, comparaison kiosques, dépenses, créances, caisses.
 * Réservé à `consulter_rapports` ; export Excel réservé `export_donnees`.
 */
function RapportsInner() {
  const { aAction } = useAuthUser();
  const peutExporter = aAction('export_donnees');

  const [onglet, setOnglet] = useState<'ventes' | 'kiosques' | 'depenses' | 'credits' | 'caisses'>('ventes');
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [fKiosque, setFKiosque] = useState('');
  const [du, setDu] = useState(aujourdhuiIlYa(30));
  const [au, setAu] = useState(aujourdhuiIlYa(0));
  const [data, setData] = useState<any>(null);
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques(res.data?.kiosques || []))
      .catch(() => {});
  }, []);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ du, au });
    if (fKiosque && onglet !== 'kiosques') params.set('kiosqueId', fKiosque);
    const url = onglet === 'credits'
      ? `/api/rapports/credits?${fKiosque ? `kiosqueId=${fKiosque}` : ''}`
      : `/api/rapports/${onglet}?${params}`;
    axios.get(url, { withCredentials: true })
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setChargement(false));
  }, [onglet, du, au, fKiosque]);

  useEffect(() => { charger(); }, [charger]);

  const exporter = () => {
    const params = new URLSearchParams({ type: onglet === 'kiosques' ? 'kiosques' : onglet, du, au });
    if (fKiosque && onglet !== 'kiosques') params.set('kiosqueId', fKiosque);
    window.open(`/api/rapports/export?${params}`, '_blank');
  };

  const resumeVentes = useMemo(() => data?.totaux, [data]);

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'comptable']} allowedActions={['consulter_rapports']}>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h4 className="mb-0"><i className="bi bi-graph-up me-2"></i>Rapports</h4>
        {peutExporter && data && (
          <Button size="sm" variant="outline-success" onClick={exporter}>
            <i className="bi bi-file-earmark-excel me-1"></i>Exporter Excel
          </Button>
        )}
      </div>

      <Nav variant="tabs" className="mb-3" activeKey={onglet} onSelect={(k) => setOnglet(k as any)}>
        <Nav.Item><Nav.Link eventKey="ventes">Ventes</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="kiosques">Comparaison kiosques</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="depenses">Dépenses</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="credits">Créances</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="caisses">Caisses</Nav.Link></Nav.Item>
      </Nav>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <Row className="g-2 align-items-center">
            <Col md={3}>
              <Form.Control size="sm" type="date" value={du} onChange={(e) => setDu(e.target.value)} />
            </Col>
            <Col md={3}>
              <Form.Control size="sm" type="date" value={au} onChange={(e) => setAu(e.target.value)} />
            </Col>
            {onglet !== 'kiosques' && (
              <Col md={3}>
                <Form.Select size="sm" value={fKiosque} onChange={(e) => setFKiosque(e.target.value)}>
                  <option value="">Tous les kiosques</option>
                  {kiosques.map((k) => <option key={k._id} value={k._id}>{k.designation}</option>)}
                </Form.Select>
              </Col>
            )}
            <Col md={3} className="d-flex gap-2">
              <Button size="sm" variant="outline-secondary" onClick={() => { setDu(aujourdhuiIlYa(0)); setAu(aujourdhuiIlYa(0)); }}>Aujourd&apos;hui</Button>
              <Button size="sm" variant="outline-secondary" onClick={() => { setDu(aujourdhuiIlYa(7)); setAu(aujourdhuiIlYa(0)); }}>7 j</Button>
              <Button size="sm" variant="outline-secondary" onClick={() => { setDu(aujourdhuiIlYa(30)); setAu(aujourdhuiIlYa(0)); }}>30 j</Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {chargement && <div className="text-center py-5"><Spinner animation="border" /></div>}
      {!chargement && !data && <div className="alert alert-warning">Aucune donnée pour cette période.</div>}

      {/* ---------- VENTES ---------- */}
      {!chargement && onglet === 'ventes' && data?.totaux && (
        <>
          <Row className="g-3 mb-3">
            {[
              { label: "Chiffre d'affaires", v: `${fmtMontant(resumeVentes.ca)} F`, i: 'bi-graph-up-arrow', c: 'text-success' },
              { label: 'Encaissé', v: `${fmtMontant(resumeVentes.encaisse)} F`, i: 'bi-cash-coin', c: 'text-primary' },
              { label: 'Ventes', v: resumeVentes.nbVentes, i: 'bi-receipt', c: 'text-dark' },
              { label: 'Panier moyen', v: `${fmtMontant(resumeVentes.panierMoyen)} F`, i: 'bi-basket', c: 'text-dark' },
              { label: 'CA comptant', v: `${fmtMontant(resumeVentes.caComptant)} F`, i: 'bi-cash', c: 'text-success' },
              { label: 'CA crédit', v: `${fmtMontant(resumeVentes.caCredit)} F`, i: 'bi-credit-card', c: 'text-warning' },
            ].map((c) => (
              <Col key={c.label} sm={6} xl={2}>
                <Card className="h-100"><Card.Body className="py-2 px-3">
                  <div className="text-muted small"><i className={`bi ${c.i} me-1`}></i>{c.label}</div>
                  <div className={`fw-bold ${c.c}`}>{c.v}</div>
                </Card.Body></Card>
              </Col>
            ))}
          </Row>

          <Row className="g-3 mb-3">
            <Col lg={7}>
              <Card>
                <Card.Header className="bg-white fw-semibold">CA par jour</Card.Header>
                <Card.Body style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.parJour.map((j: any) => ({ ...j, jour: j.date.slice(8) + '/' + j.date.slice(5, 7) }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="jour" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(v: any) => [`${fmtMontant(v)} F`, 'CA']} />
                      <Bar dataKey="comptant" stackId="a" fill="#ea580c" name="Comptant" />
                      <Bar dataKey="credit" stackId="a" fill="#ffc107" name="Crédit" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card.Body>
              </Card>
            </Col>
            <Col lg={5}>
              <Card>
                <Card.Header className="bg-white fw-semibold">Répartition par kiosque (CA)</Card.Header>
                <Card.Body style={{ height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.parKiosque.filter((k: any) => k.ca > 0)} dataKey="ca" nameKey="designation"
                        outerRadius={90} label={({ designation }: any) => designation} fontSize={11}>
                        {data.parKiosque.filter((k: any) => k.ca > 0).map((_: any, i: number) => (
                          <Cell key={i} fill={COULEURS[i % COULEURS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${fmtMontant(v)} F`, 'CA']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <Row className="g-3">
            <Col lg={7}>
              <Card>
                <Card.Header className="bg-white fw-semibold">Détail par kiosque</Card.Header>
                <Table responsive hover size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>Kiosque</th><th className="text-end">CA</th><th className="text-end">Encaissé</th><th className="text-end">Ventes</th><th className="text-end">Panier moyen</th></tr>
                  </thead>
                  <tbody>
                    {data.parKiosque.map((k: any) => (
                      <tr key={k.kiosqueId}>
                        <td>{k.designation}</td>
                        <td className="text-end fw-semibold">{fmtMontant(k.ca)}</td>
                        <td className="text-end">{fmtMontant(k.encaisse)}</td>
                        <td className="text-end">{k.nbVentes}</td>
                        <td className="text-end">{fmtMontant(k.panierMoyen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </Col>
            <Col lg={5}>
              <Card className="mb-3">
                <Card.Header className="bg-white fw-semibold">Par vendeur</Card.Header>
                <Table responsive hover size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>Vendeur</th><th className="text-end">CA</th><th className="text-end">Ventes</th></tr>
                  </thead>
                  <tbody>
                    {data.parVendeur.map((v: any) => (
                      <tr key={v.vendeurId}>
                        <td>{v.vendeur}</td>
                        <td className="text-end fw-semibold">{fmtMontant(v.ca)}</td>
                        <td className="text-end">{v.nbVentes}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
              <Card>
                <Card.Header className="bg-white fw-semibold">Top 10 produits</Card.Header>
                <Table responsive hover size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr><th>Produit</th><th className="text-end">Qté</th><th className="text-end">Montant</th></tr>
                  </thead>
                  <tbody>
                    {data.topProduits.map((p: any, i: number) => (
                      <tr key={i}>
                        <td><span className="text-muted small me-1">{p.code}</span>{p.designation}</td>
                        <td className="text-end">{p.quantite}</td>
                        <td className="text-end fw-semibold">{fmtMontant(p.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* ---------- COMPARAISON KIOSQUES ---------- */}
      {!chargement && onglet === 'kiosques' && data?.kiosques && (
        <>
          <Card className="mb-3">
            <Card.Header className="bg-white fw-semibold">Chiffre d&apos;affaires et résultat net par kiosque</Card.Header>
            <Card.Body style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.kiosques}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="designation" fontSize={12} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: any, name: any) => [`${fmtMontant(v)} F`, name]} />
                  <Bar dataKey="ca" name="CA" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resultatNet" name="Net encaissé" fill="#14213d" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="depenses" name="Dépenses" fill="#dc3545" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card.Body>
          </Card>
          <Card>
            <Table responsive hover size="sm" className="mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Kiosque</th><th className="text-end">CA</th><th className="text-end">Encaissé</th>
                  <th className="text-end">Ventes</th><th className="text-end">Panier moyen</th>
                  <th className="text-end">CA crédit</th><th className="text-end">Dépenses</th>
                  <th className="text-end">Net encaissé</th><th className="text-end">Écarts caisse</th>
                </tr>
              </thead>
              <tbody>
                {data.kiosques.map((k: any, i: number) => (
                  <tr key={k.kiosqueId}>
                    <td className="fw-semibold">
                      {i === 0 && k.ca > 0 && <i className="bi bi-trophy-fill text-warning me-1"></i>}
                      {k.designation} <span className="text-muted small">{k.code}</span>
                    </td>
                    <td className="text-end fw-semibold">{fmtMontant(k.ca)}</td>
                    <td className="text-end">{fmtMontant(k.encaisse)}</td>
                    <td className="text-end">{k.nbVentes}</td>
                    <td className="text-end">{fmtMontant(k.panierMoyen)}</td>
                    <td className="text-end">{fmtMontant(k.caCredit)}</td>
                    <td className="text-end text-danger">{fmtMontant(k.depenses)}</td>
                    <td className={`text-end fw-bold ${k.resultatNet < 0 ? 'text-danger' : 'text-success'}`}>{fmtMontant(k.resultatNet)}</td>
                    <td className={`text-end ${k.ecartsCaisse > 0 ? 'text-danger' : ''}`}>{fmtMontant(k.ecartsCaisse)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {/* ---------- DÉPENSES ---------- */}
      {!chargement && onglet === 'depenses' && data?.totaux && (
        <Row className="g-3">
          <Col lg={7}>
            <Card className="mb-3">
              <Card.Header className="bg-white fw-semibold">Dépenses par jour</Card.Header>
              <Card.Body style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.parJour.map((j: any) => ({ ...j, jour: j.date.slice(8) + '/' + j.date.slice(5, 7) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="jour" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(v: any) => [`${fmtMontant(v)} F`, 'Dépenses']} />
                    <Bar dataKey="total" fill="#dc3545" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
            <Card>
              <Card.Header className="bg-white fw-semibold">Par kiosque</Card.Header>
              <Table responsive hover size="sm" className="mb-0">
                <thead className="table-light"><tr><th>Kiosque</th><th className="text-end">Montant</th><th className="text-end">Nb</th></tr></thead>
                <tbody>
                  {data.parKiosque.map((k: any) => (
                    <tr key={k.kiosqueId}><td>{k.designation}</td><td className="text-end">{fmtMontant(k.total)}</td><td className="text-end">{k.nb}</td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Col>
          <Col lg={5}>
            <Card>
              <Card.Header className="bg-white fw-semibold d-flex justify-content-between">
                <span>Par catégorie</span>
                <Badge bg="danger">Total : {fmtMontant(data.totaux.total)} F</Badge>
              </Card.Header>
              <Table responsive hover size="sm" className="mb-0">
                <thead className="table-light"><tr><th>Catégorie</th><th className="text-end">Montant</th><th className="text-end">Nb</th></tr></thead>
                <tbody>
                  {data.parCategorie.map((c: any, i: number) => (
                    <tr key={i}><td>{c.designation}</td><td className="text-end fw-semibold">{fmtMontant(c.total)}</td><td className="text-end">{c.nb}</td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Col>
        </Row>
      )}

      {/* ---------- CRÉANCES ---------- */}
      {!chargement && onglet === 'credits' && data?.totaux && (
        <Row className="g-3">
          <Col lg={8}>
            <Card>
              <Card.Header className="bg-white fw-semibold d-flex justify-content-between">
                <span>Créances en cours par client</span>
                <Badge bg="danger">{fmtMontant(data.totaux.totalDu)} F · {data.totaux.nbClients} client(s)</Badge>
              </Card.Header>
              <Table responsive hover size="sm" className="mb-0">
                <thead className="table-light">
                  <tr><th>Client</th><th>Téléphone</th><th className="text-end">Dû</th><th className="text-end">Créances</th><th>Plus ancienne</th></tr>
                </thead>
                <tbody>
                  {data.parClient.map((c: any) => (
                    <tr key={c.clientId}>
                      <td><span className="text-muted small me-1">{c.code}</span>{c.nomComplet}</td>
                      <td className="small">{c.telephone || '—'}</td>
                      <td className="text-end fw-semibold text-danger">{fmtMontant(c.du)}</td>
                      <td className="text-end">{c.nb}</td>
                      <td className="small">{c.plusAncienne ? fmtDate(c.plusAncienne) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Col>
          <Col lg={4}>
            <Card>
              <Card.Header className="bg-white fw-semibold">Par kiosque</Card.Header>
              <Table responsive hover size="sm" className="mb-0">
                <thead className="table-light"><tr><th>Kiosque</th><th className="text-end">Dû</th><th className="text-end">Nb</th></tr></thead>
                <tbody>
                  {data.parKiosque.map((k: any) => (
                    <tr key={k.kiosqueId}><td>{k.designation}</td><td className="text-end text-danger fw-semibold">{fmtMontant(k.du)}</td><td className="text-end">{k.nb}</td></tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </Col>
        </Row>
      )}

      {/* ---------- CAISSES ---------- */}
      {!chargement && onglet === 'caisses' && data?.sessions && (
        <Card>
          <Card.Header className="bg-white fw-semibold d-flex justify-content-between">
            <span>Sessions de caisse</span>
            <span>
              <Badge bg="secondary" className="me-2">{data.totaux.cloturees} clôturée(s)</Badge>
              <Badge bg={data.totaux.ecartTotal > 0 ? 'danger' : 'success'}>Écarts cumulés : {fmtMontant(data.totaux.ecartTotal)} F</Badge>
            </span>
          </Card.Header>
          <Table responsive hover size="sm" className="mb-0">
            <thead className="table-light">
              <tr>
                <th>Numéro</th><th>Kiosque</th><th>Ouverte par</th><th>Ouverture</th>
                <th className="text-end">Fond</th><th className="text-end">Théorique</th>
                <th className="text-end">Compté</th><th className="text-end">Écart</th><th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s: any) => (
                <tr key={s._id}>
                  <td className="small">{s.numero}</td>
                  <td className="small">{s.kiosqueNom}</td>
                  <td className="small">{s.ouverteParNom}</td>
                  <td className="small">{s.dateOuverture ? fmtDate(s.dateOuverture) : '—'}</td>
                  <td className="text-end">{fmtMontant(s.fondDeCaisse)}</td>
                  <td className="text-end">{s.soldeTheorique !== null ? fmtMontant(s.soldeTheorique) : '—'}</td>
                  <td className="text-end">{s.montantCompte !== null ? fmtMontant(s.montantCompte) : '—'}</td>
                  <td className={`text-end fw-semibold ${s.ecart ? (s.ecart < 0 ? 'text-danger' : 'text-warning') : ''}`}>
                    {s.ecart !== null ? fmtMontant(s.ecart) : '—'}
                  </td>
                  <td>
                    {s.statut === 'cloturee' ? <Badge bg="secondary">Clôturée</Badge>
                      : s.statut === 'en_cloture' ? <Badge bg="warning" text="dark">Point en attente</Badge>
                      : <Badge bg="success">Ouverte</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </RoleGuard>
  );
}

export default function PageRapports() {
  return <RapportsInner />;
}
