'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Badge, Button, Card, Form, InputGroup, Modal, Nav, Pagination,
  Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant, fmtDate } from '@/lib/format';
import type { ListeMouvements, ListeNiveaux, MouvementStockDTO, NiveauStockDTO } from '@/types/stock';

interface KiosqueLite { _id: string; code: string; designation: string }

const TYPE_LABELS: Record<string, { label: string; bg: string }> = {
  entree: { label: 'Entrée', bg: 'success' },
  vente: { label: 'Vente', bg: 'primary' },
  annulation_vente: { label: 'Annulation vente', bg: 'warning' },
  ajustement: { label: 'Ajustement', bg: 'secondary' },
  inventaire: { label: 'Inventaire', bg: 'info' },
};

function StockInner() {
  const { aAction } = useAuthUser();
  const peutGerer = aAction('gestion_stock');

  const [onglet, setOnglet] = useState<'niveaux' | 'mouvements'>('niveaux');
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);

  // ---- Niveaux ----
  const [niveaux, setNiveaux] = useState<ListeNiveaux | null>(null);
  const [chargement, setChargement] = useState(true);
  const [fKiosque, setFKiosque] = useState('');
  const [q, setQ] = useState('');
  const [qRecherche, setQRecherche] = useState('');
  const [sousSeuilSeulement, setSousSeuilSeulement] = useState(false);

  // ---- Mouvements ----
  const [mvts, setMvts] = useState<ListeMouvements | null>(null);
  const [fKiosqueMvt, setFKiosqueMvt] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [pageMvt, setPageMvt] = useState(1);

  // ---- Modales ----
  const [entreePour, setEntreePour] = useState<NiveauStockDTO | null>(null);
  const [ajustPour, setAjustPour] = useState<NiveauStockDTO | null>(null);
  const [quantiteEntree, setQuantiteEntree] = useState('');
  const [motifEntree, setMotifEntree] = useState('');
  const [quantiteReelle, setQuantiteReelle] = useState('');
  const [motifAjust, setMotifAjust] = useState('');
  const [envoi, setEnvoi] = useState(false);

  // ---- Fiches collectives (entrée multi-produits / inventaire) ----
  const [fiche, setFiche] = useState<'entree' | 'inventaire' | null>(null);
  const [ficheKiosque, setFicheKiosque] = useState('');
  const [ficheNiveaux, setFicheNiveaux] = useState<NiveauStockDTO[] | null>(null);
  const [ficheLignes, setFicheLignes] = useState<Record<string, string>>({});
  const [ficheMotif, setFicheMotif] = useState('');

  const chargerNiveaux = useCallback(async () => {
    setChargement(true);
    try {
      const params = new URLSearchParams();
      if (fKiosque) params.set('kiosqueId', fKiosque);
      if (qRecherche) params.set('q', qRecherche);
      const res = await axios.get<ListeNiveaux>(`/api/stock?${params}`, { withCredentials: true });
      setNiveaux(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur de chargement du stock');
    } finally {
      setChargement(false);
    }
  }, [fKiosque, qRecherche]);

  const chargerMouvements = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(pageMvt) });
      if (fKiosqueMvt) params.set('kiosqueId', fKiosqueMvt);
      if (du) params.set('du', du);
      if (au) params.set('au', au);
      const res = await axios.get<ListeMouvements>(`/api/stock/mouvements?${params}`, { withCredentials: true });
      setMvts(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur de chargement des mouvements');
    }
  }, [fKiosqueMvt, du, au, pageMvt]);

  useEffect(() => {
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques((res.data?.kiosques || []).filter((k: any) => k.statut !== 'inactif')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQRecherche(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { chargerNiveaux(); }, [chargerNiveaux]);
  useEffect(() => { if (onglet === 'mouvements') chargerMouvements(); }, [onglet, chargerMouvements]);

  // Ouvre une fiche collective sur le kiosque filtré (ou le premier disponible)
  const ouvrirFiche = (type: 'entree' | 'inventaire') => {
    setFiche(type);
    setFicheKiosque(fKiosque || kiosques[0]?._id || '');
    setFicheNiveaux(null);
    setFicheLignes({});
    setFicheMotif('');
  };

  // Charge les niveaux du kiosque de la fiche ; en inventaire, les champs
  // sont préremplis avec le stock enregistré (on ne modifie que les écarts)
  useEffect(() => {
    if (!fiche || !ficheKiosque) { setFicheNiveaux(null); return; }
    let actif = true;
    axios.get<ListeNiveaux>(`/api/stock?kiosqueId=${ficheKiosque}`, { withCredentials: true })
      .then((res) => {
        if (!actif) return;
        const n = res.data?.niveaux || [];
        setFicheNiveaux(n);
        if (fiche === 'inventaire') {
          const init: Record<string, string> = {};
          n.forEach((l) => { init[l.produitId] = String(l.quantite); });
          setFicheLignes(init);
        }
      })
      .catch(() => toast.error('Erreur de chargement des niveaux'));
    return () => { actif = false; };
  }, [fiche, ficheKiosque]);

  // Lignes réellement renseignées dans la fiche
  const lignesFiche = (ficheNiveaux || [])
    .map((n) => {
      const saisie = Number(ficheLignes[n.produitId]);
      return fiche === 'inventaire'
        ? { produitId: n.produitId, nouvelleQuantite: saisie, change: Number.isInteger(saisie) && saisie >= 0 && saisie !== n.quantite }
        : { produitId: n.produitId, quantite: saisie, change: Number.isInteger(saisie) && saisie > 0 };
    })
    .filter((l) => l.change);

  const enregistrerFiche = async () => {
    if (!fiche || !ficheKiosque) return;
    if (lignesFiche.length === 0) {
      return toast.warning(fiche === 'entree' ? 'Saisissez au moins une quantité à entrer.' : 'Aucun écart saisi — le stock correspond déjà.');
    }
    if (fiche === 'inventaire' && ficheMotif.trim().length < 3) {
      return toast.warning("Le motif est obligatoire pour l'inventaire (3 caractères min.).");
    }
    setEnvoi(true);
    try {
      const url = fiche === 'entree' ? '/api/stock/entrees' : '/api/stock/ajustements';
      const body: any = { kiosqueId: ficheKiosque, lignes: lignesFiche };
      body.motif = fiche === 'inventaire' ? ficheMotif.trim() : ficheMotif.trim() || undefined;
      const res = await axios.post(url, body, { withCredentials: true });
      toast.success(
        fiche === 'entree'
          ? `Fiche d'entrée enregistrée — ${res.data?.lignes?.length ?? lignesFiche.length} produit(s)`
          : `Inventaire enregistré — ${res.data?.modifiees ?? lignesFiche.length} écart(s)`
      );
      setFiche(null);
      chargerNiveaux();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur lors de l'enregistrement de la fiche");
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrerEntree = async () => {
    if (!entreePour) return;
    const quantite = Number(quantiteEntree);
    if (!Number.isInteger(quantite) || quantite <= 0) {
      return toast.warning('Saisissez une quantité entière supérieure à 0.');
    }
    setEnvoi(true);
    try {
      await axios.post('/api/stock/entrees', {
        kiosqueId: entreePour.kiosqueId,
        produitId: entreePour.produitId,
        quantite,
        motif: motifEntree || undefined,
      }, { withCredentials: true });
      toast.success(`Entrée enregistrée — ${entreePour.designation}`);
      setEntreePour(null);
      setQuantiteEntree('');
      setMotifEntree('');
      chargerNiveaux();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur lors de l'entrée");
    } finally {
      setEnvoi(false);
    }
  };

  const enregistrerAjustement = async () => {
    if (!ajustPour) return;
    const nouvelleQuantite = Number(quantiteReelle);
    if (!Number.isInteger(nouvelleQuantite) || nouvelleQuantite < 0) {
      return toast.warning('Saisissez le stock réel compté (entier ≥ 0).');
    }
    if (motifAjust.trim().length < 3) {
      return toast.warning('Le motif est obligatoire (3 caractères min.).');
    }
    setEnvoi(true);
    try {
      await axios.post('/api/stock/ajustements', {
        kiosqueId: ajustPour.kiosqueId,
        produitId: ajustPour.produitId,
        nouvelleQuantite,
        motif: motifAjust.trim(),
      }, { withCredentials: true });
      toast.success(`Ajustement enregistré — ${ajustPour.designation}`);
      setAjustPour(null);
      setQuantiteReelle('');
      setMotifAjust('');
      chargerNiveaux();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Erreur lors de l'ajustement");
    } finally {
      setEnvoi(false);
    }
  };

  const niveauxAffiches = (niveaux?.niveaux || []).filter(
    (n) => !sousSeuilSeulement || n.rupture || n.sousSeuil
  );
  const nbSousSeuil = (niveaux?.niveaux || []).filter((n) => n.rupture || n.sousSeuil).length;
  const totalValorisation = niveauxAffiches.reduce((s, n) => s + n.valorisation, 0);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Stock</h3>
        {nbSousSeuil > 0 && (
          <Badge bg="warning" text="dark" className="fs-6">
            <i className="bi bi-exclamation-triangle me-1"></i>
            {nbSousSeuil} produit(s) en rupture ou sous seuil
          </Badge>
        )}
      </div>

      {niveaux && !niveaux.stockActif && (
        <Alert variant="info" className="d-flex align-items-center gap-2">
          <i className="bi bi-info-circle fs-5"></i>
          <div>
            La gestion de stock est <strong>désactivée</strong> pour cette entreprise — les ventes ne
            décrémentent rien. Activez-la dans{' '}
            <a href="/dashboard/parametres/entreprise" className="alert-link">Paramètres → Entreprise</a>.
            Seuls les produits de type « revente » sont suivis.
          </div>
        </Alert>
      )}

      <Nav variant="tabs" className="mb-3" activeKey={onglet} onSelect={(k) => setOnglet(k as any)}>
        <Nav.Item><Nav.Link eventKey="niveaux">Niveaux de stock</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="mouvements">Mouvements</Nav.Link></Nav.Item>
      </Nav>

      {onglet === 'niveaux' && (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Select
              value={fKiosque}
              onChange={(e) => setFKiosque(e.target.value)}
              style={{ maxWidth: 240 }}
            >
              <option value="">Tous les kiosques</option>
              {kiosques.map((k) => (
                <option key={k._id} value={k._id}>{k.code ? `${k.code} — ` : ''}{k.designation}</option>
              ))}
            </Form.Select>
            <InputGroup style={{ maxWidth: 320 }}>
              <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
              <Form.Control
                placeholder="Rechercher un produit…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </InputGroup>
            <Form.Check
              type="switch"
              id="sous-seuil"
              label="Ruptures & sous seuil"
              checked={sousSeuilSeulement}
              onChange={(e) => setSousSeuilSeulement(e.target.checked)}
              className="align-self-center"
            />
            {peutGerer && niveaux?.stockActif && (
              <div className="ms-auto d-flex gap-2">
                <Button variant="outline-success" size="sm" onClick={() => ouvrirFiche('entree')}>
                  <i className="bi bi-clipboard-plus me-1"></i>Fiche d'entrée
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={() => ouvrirFiche('inventaire')}>
                  <i className="bi bi-clipboard-check me-1"></i>Fiche d'inventaire
                </Button>
              </div>
            )}
          </div>

          <Card>
            <Card.Body className="p-0">
              {chargement ? (
                <div className="text-center p-4"><Spinner animation="border" /></div>
              ) : niveauxAffiches.length === 0 ? (
                <div className="text-center p-4 text-muted">
                  Aucun produit de revente à afficher.
                </div>
              ) : (
                <Table responsive hover className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Produit</th>
                      <th>Kiosque</th>
                      <th className="text-end">Stock</th>
                      <th className="text-end">Seuil</th>
                      <th className="text-end">Valorisation</th>
                      <th>État</th>
                      {peutGerer && <th className="text-end">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {niveauxAffiches.map((n) => (
                      <tr key={`${n.kiosqueId}:${n.produitId}`} className={n.rupture ? 'table-danger' : n.sousSeuil ? 'table-warning' : ''}>
                        <td>
                          <span className="text-muted small me-1">{n.code}</span>
                          {n.designation}
                        </td>
                        <td>{n.kiosqueNom}</td>
                        <td className="text-end fw-semibold">{n.quantite}</td>
                        <td className="text-end text-muted">{n.seuilAlerte ?? '—'}</td>
                        <td className="text-end">{fmtMontant(n.valorisation)} F</td>
                        <td>
                          {n.rupture ? (
                            <Badge bg="danger">Rupture</Badge>
                          ) : n.sousSeuil ? (
                            <Badge bg="warning" text="dark">Sous seuil</Badge>
                          ) : (
                            <Badge bg="success">OK</Badge>
                          )}
                        </td>
                        {peutGerer && (
                          <td className="text-end">
                            <Button
                              size="sm"
                              variant="outline-success"
                              className="me-1"
                              onClick={() => { setEntreePour(n); setQuantiteEntree(''); setMotifEntree(''); }}
                              disabled={!niveaux?.stockActif}
                            >
                              <i className="bi bi-plus-lg me-1"></i>Entrée
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => { setAjustPour(n); setQuantiteReelle(String(n.quantite)); setMotifAjust(''); }}
                              disabled={!niveaux?.stockActif}
                            >
                              <i className="bi bi-sliders me-1"></i>Ajuster
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="table-light">
                    <tr>
                      <td colSpan={4} className="text-end fw-semibold">Valorisation totale (prix d'achat)</td>
                      <td className="text-end fw-bold">{fmtMontant(totalValorisation)} F</td>
                      <td colSpan={peutGerer ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                </Table>
              )}
            </Card.Body>
          </Card>
          {niveaux?.stockActif && (
            <small className="text-muted d-block mt-2">
              Les sorties de stock se font automatiquement à la validation des ventes ;
              une annulation restitue les quantités.
              {niveaux.venteSansStockAutorisee
                ? ' Vente en rupture autorisée (stock négatif toléré).'
                : ' Les ventes en rupture sont bloquées.'}
            </small>
          )}
        </>
      )}

      {onglet === 'mouvements' && (
        <>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Select
              value={fKiosqueMvt}
              onChange={(e) => { setFKiosqueMvt(e.target.value); setPageMvt(1); }}
              style={{ maxWidth: 240 }}
            >
              <option value="">Tous les kiosques</option>
              {kiosques.map((k) => (
                <option key={k._id} value={k._id}>{k.code ? `${k.code} — ` : ''}{k.designation}</option>
              ))}
            </Form.Select>
            <Form.Control type="date" value={du} onChange={(e) => { setDu(e.target.value); setPageMvt(1); }} style={{ maxWidth: 170 }} />
            <Form.Control type="date" value={au} onChange={(e) => { setAu(e.target.value); setPageMvt(1); }} style={{ maxWidth: 170 }} />
            <Button variant="outline-secondary" onClick={chargerMouvements}>
              <i className="bi bi-arrow-clockwise"></i>
            </Button>
          </div>

          <Card>
            <Card.Body className="p-0">
              {!mvts ? (
                <div className="text-center p-4"><Spinner animation="border" /></div>
              ) : mvts.mouvements.length === 0 ? (
                <div className="text-center p-4 text-muted">Aucun mouvement sur la période.</div>
              ) : (
                <Table responsive hover className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Date</th>
                      <th>Produit</th>
                      <th>Type</th>
                      <th className="text-end">Qté</th>
                      <th className="text-end">Avant → Après</th>
                      <th>Par</th>
                      <th>Motif / réf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mvts.mouvements.map((m: MouvementStockDTO) => {
                      const kiosqueNom = kiosques.find((k) => k._id === m.kiosqueId)?.designation || '';
                      const t = TYPE_LABELS[m.type] || { label: m.type, bg: 'secondary' };
                      return (
                        <tr key={m._id}>
                          <td className="small">{fmtDate(m.createdAt)}</td>
                          <td>
                            <span className="text-muted small me-1">{m.produitCode}</span>
                            {m.produitDesignation}
                            {kiosqueNom && <div className="small text-muted">{kiosqueNom}</div>}
                          </td>
                          <td><Badge bg={t.bg}>{t.label}</Badge></td>
                          <td className={`text-end fw-semibold ${m.quantite < 0 ? 'text-danger' : 'text-success'}`}>
                            {m.quantite > 0 ? `+${m.quantite}` : m.quantite}
                          </td>
                          <td className="text-end">{m.avant} → <strong>{m.apres}</strong></td>
                          <td className="small">{m.userNom}</td>
                          <td className="small text-muted">{m.motif || m.venteNumero || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>

          {mvts && mvts.pages > 1 && (
            <Pagination className="mt-3">
              {Array.from({ length: mvts.pages }, (_, i) => i + 1).slice(0, 10).map((p) => (
                <Pagination.Item key={p} active={p === mvts.page} onClick={() => setPageMvt(p)}>
                  {p}
                </Pagination.Item>
              ))}
            </Pagination>
          )}
        </>
      )}

      {/* Modale entrée de stock */}
      <Modal show={!!entreePour} onHide={() => setEntreePour(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Entrée de stock</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {entreePour && (
            <>
              <p className="mb-2">
                <strong>{entreePour.designation}</strong>
                <span className="text-muted"> — {entreePour.kiosqueNom} — stock actuel : {entreePour.quantite}</span>
              </p>
              <Form.Group className="mb-3">
                <Form.Label>Quantité entrée *</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  value={quantiteEntree}
                  onChange={(e) => setQuantiteEntree(e.target.value)}
                  autoFocus
                />
              </Form.Group>
              <Form.Group>
                <Form.Label>Motif / référence (facultatif)</Form.Label>
                <Form.Control
                  placeholder="Ex : livraison fournisseur, BL-125…"
                  value={motifEntree}
                  onChange={(e) => setMotifEntree(e.target.value)}
                />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setEntreePour(null)}>Annuler</Button>
          <Button variant="success" size="sm" onClick={enregistrerEntree} disabled={envoi}>
            {envoi ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-plus-lg me-1"></i>Enregistrer</>}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Fiche collective — entrée multi-produits ou inventaire complet */}
      <Modal show={!!fiche} onHide={() => setFiche(null)} size="lg" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>
            {fiche === 'entree' ? "Fiche d'entrée de stock" : "Fiche d'inventaire"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-flex gap-2 flex-wrap mb-3">
            <Form.Group>
              <Form.Label>Kiosque *</Form.Label>
              <Form.Select
                value={ficheKiosque}
                onChange={(e) => { setFicheKiosque(e.target.value); setFicheLignes({}); }}
                style={{ minWidth: 220 }}
              >
                {kiosques.map((k) => (
                  <option key={k._id} value={k._id}>{k.code ? `${k.code} — ` : ''}{k.designation}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="flex-grow-1">
              <Form.Label>
                {fiche === 'inventaire' ? "Motif * (inventaire, casse, erreur…)" : 'Motif / référence (facultatif)'}
              </Form.Label>
              <Form.Control
                placeholder={fiche === 'inventaire' ? 'Obligatoire' : 'Ex : livraison fournisseur, BL-125…'}
                value={ficheMotif}
                onChange={(e) => setFicheMotif(e.target.value)}
              />
            </Form.Group>
          </div>

          {ficheNiveaux === null ? (
            <div className="text-center p-4"><Spinner animation="border" /></div>
          ) : ficheNiveaux.length === 0 ? (
            <div className="text-center p-4 text-muted">Aucun produit de revente sur ce kiosque.</div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <Table hover size="sm" className="mb-0 align-middle">
                <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                  <tr>
                    <th>Produit</th>
                    <th className="text-end">Stock actuel</th>
                    <th className="text-end" style={{ width: 150 }}>
                      {fiche === 'entree' ? 'Quantité entrée' : 'Stock réel compté'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ficheNiveaux.map((n) => {
                    const saisie = ficheLignes[n.produitId] ?? '';
                    const val = Number(saisie);
                    const actifLigne = fiche === 'entree'
                      ? Number.isInteger(val) && val > 0
                      : saisie !== '' && Number.isInteger(val) && val >= 0 && val !== n.quantite;
                    return (
                      <tr key={n.produitId} className={actifLigne ? (fiche === 'entree' ? 'table-success' : 'table-warning') : ''}>
                        <td>
                          <span className="text-muted small me-1">{n.code}</span>
                          {n.designation}
                          {n.rupture && <Badge bg="danger" className="ms-1">rupture</Badge>}
                        </td>
                        <td className="text-end text-muted">{n.quantite}</td>
                        <td className="text-end">
                          <Form.Control
                            type="number"
                            size="sm"
                            min={0}
                            value={saisie}
                            onChange={(e) => setFicheLignes((p) => ({ ...p, [n.produitId]: e.target.value }))}
                            style={{ width: 110, marginLeft: 'auto', textAlign: 'right' }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
          <small className="text-muted d-block mt-2">
            {fiche === 'entree'
              ? 'Seules les lignes avec une quantité > 0 seront enregistrées — tout est appliqué en une seule fois.'
              : 'Saisissez le stock réellement compté : seuls les écarts produiront un ajustement tracé.'}
          </small>
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <span className="text-muted small">{lignesFiche.length} ligne(s) à enregistrer</span>
          <div>
            <Button variant="secondary" size="sm" className="me-2" onClick={() => setFiche(null)}>Annuler</Button>
            <Button
              variant={fiche === 'entree' ? 'success' : 'primary'}
              size="sm"
              onClick={enregistrerFiche}
              disabled={envoi || lignesFiche.length === 0}
            >
              {envoi ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-check2-all me-1"></i>Valider la fiche</>}
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      {/* Modale ajustement */}
      <Modal show={!!ajustPour} onHide={() => setAjustPour(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Ajuster le stock</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {ajustPour && (
            <>
              <p className="mb-2">
                <strong>{ajustPour.designation}</strong>
                <span className="text-muted"> — {ajustPour.kiosqueNom} — stock enregistré : {ajustPour.quantite}</span>
              </p>
              <Form.Group className="mb-3">
                <Form.Label>Stock réel compté *</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  value={quantiteReelle}
                  onChange={(e) => setQuantiteReelle(e.target.value)}
                  autoFocus
                />
                <Form.Text className="text-muted">
                  Le delta ({Number(quantiteReelle || 0) - ajustPour.quantite >= 0 ? '+' : ''}
                  {Number(quantiteReelle || 0) - ajustPour.quantite}) sera tracé dans les mouvements.
                </Form.Text>
              </Form.Group>
              <Form.Group>
                <Form.Label>Motif * (casse, erreur de comptage, inventaire…)</Form.Label>
                <Form.Control
                  value={motifAjust}
                  onChange={(e) => setMotifAjust(e.target.value)}
                  placeholder="Obligatoire"
                />
              </Form.Group>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setAjustPour(null)}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={enregistrerAjustement} disabled={envoi}>
            {envoi ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-check2 me-1"></i>Enregistrer</>}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default function StockPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'comptable']} allowedActions={['consulter_stock', 'gestion_stock']}>
      <StockInner />
    </RoleGuard>
  );
}
