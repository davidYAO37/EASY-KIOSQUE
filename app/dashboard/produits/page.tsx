'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Form, InputGroup, Modal, Pagination, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useLecture } from '@/hooks/useLecture';
import RoleGuard from '@/components/RoleGuard';
import { fmtMontant } from '@/lib/format';
import type { CategorieDTO, ListeProduits, ProduitDTO } from '@/types/catalogue';

const TYPES = { FABRIQUE: 'Fabriqué', REVENTE: 'Revente', MIXTE: 'Mixte' } as const;

interface KiosqueLite { _id: string; code: string; designation: string }

interface FormProduit {
  code: string; codeBarre: string; designation: string; categorieId: string;
  typeProduit: 'FABRIQUE' | 'REVENTE' | 'MIXTE';
  prixAchat: string; prixVente: string; seuilAlerte: string; description: string; image: string;
}

const VIDE: FormProduit = {
  code: '', codeBarre: '', designation: '', categorieId: '', typeProduit: 'REVENTE',
  prixAchat: '', prixVente: '', seuilAlerte: '', description: '', image: '',
};

function ProduitsInner() {
  const [data, setData] = useState<ListeProduits>({ produits: [], total: 0, page: 1, pages: 1, limit: 20 });
  const [categories, setCategories] = useState<CategorieDTO[]>([]);
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [chargement, setChargement] = useState(true);
  const { user, aAction } = useAuthUser();
  const peutGerer = user?.type === 'admin' || user?.type === 'gestionnaire' || aAction('gerer_produits');
  const lire = useLecture();

  // Filtres
  const [q, setQ] = useState('');
  const [qRecherche, setQRecherche] = useState('');
  const [categorieId, setCategorieId] = useState('');
  const [typeProduit, setTypeProduit] = useState('');
  const [statut, setStatut] = useState('actif');
  const [page, setPage] = useState(1);

  // Modale
  const [showModal, setShowModal] = useState(false);
  const [edition, setEdition] = useState<ProduitDTO | null>(null);
  const [form, setForm] = useState(VIDE);
  const [prixKiosques, setPrixKiosques] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fichierRef = useRef<HTMLInputElement>(null);
  const [importEnCours, setImportEnCours] = useState(false);

  // Recherche avec délai (debounce)
  useEffect(() => {
    const t = setTimeout(() => { setQRecherche(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const charger = useCallback(() => {
    setChargement(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (qRecherche) params.set('q', qRecherche);
    if (categorieId) params.set('categorieId', categorieId);
    if (typeProduit) params.set('typeProduit', typeProduit);
    if (statut) params.set('statut', statut);
    void lire<ListeProduits>(`/api/produits?${params}`, setData,
      () => toast.error('Erreur de chargement des produits'), () => setChargement(false));
  }, [page, qRecherche, categorieId, typeProduit, statut, lire]);

  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    axios.get('/api/categories', { withCredentials: true })
      .then((res) => setCategories(res.data?.categories || []))
      .catch(() => {});
    axios.get('/api/kiosques', { withCredentials: true })
      .then((res) => setKiosques((res.data?.kiosques || []).filter((k: any) => k.statut !== 'inactif')))
      .catch(() => {});
  }, []);

  const ouvrir = (p?: ProduitDTO) => {
    setEdition(p || null);
    const pk: Record<string, string> = {};
    (p?.prixKiosques || []).forEach((x) => { pk[x.kiosqueId] = String(x.prixVente); });
    setPrixKiosques(pk);
    setForm(
      p
        ? {
            code: p.code || '',
            codeBarre: p.codeBarre || '',
            designation: p.designation || '',
            categorieId: p.categorieId || '',
            typeProduit: p.typeProduit || 'REVENTE',
            prixAchat: p.prixAchat != null ? String(p.prixAchat) : '',
            prixVente: String(p.prixVente ?? ''),
            seuilAlerte: p.seuilAlerte != null ? String(p.seuilAlerte) : '',
            description: p.description || '',
            image: p.image || '',
          }
        : VIDE
    );
    setShowModal(true);
  };

  const chargerImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 500 * 1024) {
      toast.warning('Image trop lourde (max 500 Ko)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, 320 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * ratio));
        canvas.height = Math.max(1, Math.round(image.height * ratio));
        const contexte = canvas.getContext('2d');
        if (!contexte) return toast.error('Impossible de préparer cette image');
        contexte.drawImage(image, 0, 0, canvas.width, canvas.height);
        setForm((prev) => ({ ...prev, image: canvas.toDataURL('image/webp', 0.8) }));
      };
      image.onerror = () => toast.error('Image invalide');
      image.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        code: form.code || undefined,
        codeBarre: form.codeBarre.trim() || null,
        designation: form.designation,
        categorieId: form.categorieId || null,
        typeProduit: form.typeProduit,
        prixAchat: form.prixAchat === '' ? null : Number(form.prixAchat),
        prixVente: Number(form.prixVente),
        seuilAlerte: form.seuilAlerte === '' ? null : Number(form.seuilAlerte),
        description: form.description || undefined,
        image: form.image || undefined,
        prixKiosques: Object.entries(prixKiosques)
          .filter(([, v]) => v !== '' && Number.isFinite(Number(v)))
          .map(([kiosqueId, v]) => ({ kiosqueId, prixVente: Number(v) })),
      };
      if (edition) {
        await axios.put(`/api/produits/${edition._id}`, payload, { withCredentials: true });
        toast.success('Produit modifié');
      } else {
        await axios.post('/api/produits', payload, { withCredentials: true });
        toast.success('Produit créé');
      }
      setShowModal(false);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const basculer = async (p: ProduitDTO) => {
    try {
      await axios.put(`/api/produits/${p._id}`, {
        statut: p.statut === 'actif' ? 'inactif' : 'actif',
      }, { withCredentials: true });
      toast.success(`Produit ${p.statut === 'actif' ? 'désactivé' : 'activé'}`);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const importer = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setImportEnCours(true);
    try {
      const fd = new FormData();
      fd.append('fichier', f);
      const res = await axios.post('/api/produits/import', fd, { withCredentials: true });
      const { crees, majs, erreurs } = res.data;
      if (erreurs?.length) {
        toast.warning(`${res.data.message} — ex. ligne ${erreurs[0].ligne}: ${erreurs[0].message}`);
      } else {
        toast.success(res.data.message);
      }
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur d'import");
    } finally {
      setImportEnCours(false);
    }
  };

  const urlExport = () => {
    const params = new URLSearchParams();
    if (qRecherche) params.set('q', qRecherche);
    if (categorieId) params.set('categorieId', categorieId);
    if (typeProduit) params.set('typeProduit', typeProduit);
    if (statut) params.set('statut', statut);
    return `/api/produits/export?${params}`;
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Produits</h3>
        <div className="d-flex gap-2 flex-wrap">
          {peutGerer && (
            <>
              <input ref={fichierRef} type="file" accept=".xlsx,.xls" hidden onChange={importer} />
              <Button variant="outline-secondary" onClick={() => fichierRef.current?.click()} disabled={importEnCours}>
                <i className="bi bi-upload me-2"></i>{importEnCours ? 'Import...' : 'Importer'}
              </Button>
            </>
          )}
          <a href={urlExport()} className="btn btn-outline-secondary">
            <i className="bi bi-download me-2"></i>Exporter
          </a>
          {peutGerer && (
            <Button variant="primary" onClick={() => ouvrir()}>
              <i className="bi bi-plus-lg me-2"></i>Nouveau produit
            </Button>
          )}
        </div>
      </div>

      <Card className="mb-3">
        <Card.Body className="py-2">
          <div className="row g-2 align-items-center">
            <div className="col-md-4">
              <InputGroup size="sm">
                <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
                <Form.Control
                  placeholder="Rechercher (désignation, code...)"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </InputGroup>
            </div>
            <div className="col-md-3">
              <Form.Select size="sm" value={categorieId} onChange={(e) => { setCategorieId(e.target.value); setPage(1); }}>
                <option value="">Toutes catégories</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>{c.libelle}</option>
                ))}
              </Form.Select>
            </div>
            <div className="col-md-2">
              <Form.Select size="sm" value={typeProduit} onChange={(e) => { setTypeProduit(e.target.value); setPage(1); }}>
                <option value="">Tous types</option>
                <option value="FABRIQUE">Fabriqué</option>
                <option value="REVENTE">Revente</option>
                <option value="MIXTE">Mixte</option>
              </Form.Select>
            </div>
            <div className="col-md-2">
              <Form.Select size="sm" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
                <option value="">Tous statuts</option>
                <option value="actif">Actifs</option>
                <option value="inactif">Inactifs</option>
              </Form.Select>
            </div>
            <div className="col-md-1 text-end">
              <Badge bg="secondary">{data.total}</Badge>
            </div>
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle" aria-busy={chargement}>
            {chargement && <caption className="caption-top small">Actualisation…</caption>}
            <thead className="table-light">
              <tr>
                <th style={{ width: 54 }}></th>
                <th>Code</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Type</th>
                <th className="text-end">Prix de vente</th>
                <th>Statut</th>
                {peutGerer && <th className="text-end">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {chargement && data.produits.length === 0 ? (
                <tr><td colSpan={8} className="text-center p-4">Chargement...</td></tr>
              ) : data.produits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center p-4 text-muted">
                    Aucun produit — créez-en un ou importez un fichier Excel.
                  </td>
                </tr>
              ) : (
                data.produits.map((p) => (
                  <tr key={p._id} className={p.statut === 'inactif' ? 'text-muted' : ''}>
                    <td>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
                      ) : (
                        <span className="d-inline-flex align-items-center justify-content-center bg-light rounded" style={{ width: 40, height: 40 }}>
                          <i className="bi bi-box-seam text-muted"></i>
                        </span>
                      )}
                    </td>
                    <td className="fw-semibold">{p.code}</td>
                    <td>
                      {p.designation}
                      {p.prixKiosques && p.prixKiosques.length > 0 && (
                        <div><small className="text-muted">Prix personnalisé sur {p.prixKiosques.length} kiosque(s)</small></div>
                      )}
                    </td>
                    <td>{p.categorie?.libelle || '—'}</td>
                    <td>
                      <Badge bg={p.typeProduit === 'FABRIQUE' ? 'success' : p.typeProduit === 'MIXTE' ? 'info' : 'secondary'} text={p.typeProduit === 'MIXTE' ? 'dark' : undefined}>
                        {TYPES[p.typeProduit] || p.typeProduit}
                      </Badge>
                    </td>
                    <td className="text-end fw-semibold">{fmtMontant(p.prixVente)} F</td>
                    <td>
                      {p.statut === 'actif'
                        ? <Badge bg="success">Actif</Badge>
                        : <Badge bg="secondary">Inactif</Badge>}
                    </td>
                    {peutGerer && (
                      <td className="text-end">
                        <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrir(p)}>
                          <i className="bi bi-pencil"></i>
                        </Button>
                        <Button
                          size="sm"
                          variant={p.statut === 'actif' ? 'outline-warning' : 'outline-success'}
                          className="me-1"
                          title={p.statut === 'actif' ? 'Désactiver' : 'Activer'}
                          onClick={() => basculer(p)}
                        >
                          <i className={`bi ${p.statut === 'actif' ? 'bi-pause-circle' : 'bi-play-circle'}`}></i>
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
        {data.pages > 1 && (
          <Card.Footer className="d-flex justify-content-between align-items-center">
            <small className="text-muted">{data.total} produit(s) — page {data.page}/{data.pages}</small>
            <Pagination size="sm" className="mb-0">
              <Pagination.Prev disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} />
              {Array.from({ length: Math.min(data.pages, 7) }, (_, i) => {
                const n = data.pages <= 7 ? i + 1 : Math.min(Math.max(1, data.page - 3) + i, data.pages);
                return (
                  <Pagination.Item key={n} active={n === data.page} onClick={() => setPage(n)}>
                    {n}
                  </Pagination.Item>
                );
              })}
              <Pagination.Next disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} />
            </Pagination>
          </Card.Footer>
        )}
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg" scrollable>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>{edition ? 'Modifier le produit' : 'Nouveau produit'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="row">
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Désignation *</Form.Label>
                  <Form.Control value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Code produit</Form.Label>
                  <Form.Control
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="Auto (P0001)"
                  />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Code-barres</Form.Label>
                  <Form.Control
                    value={form.codeBarre}
                    onChange={(e) => setForm({ ...form, codeBarre: e.target.value.trim() })}
                    placeholder="Scan en vente (EAN-13…)"
                  />
                </Form.Group>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Catégorie</Form.Label>
                  <Form.Select value={form.categorieId} onChange={(e) => setForm({ ...form, categorieId: e.target.value })}>
                    <option value="">— Sans catégorie —</option>
                    {categories.filter((c) => c.statut !== 'inactif').map((c) => (
                      <option key={c._id} value={c._id}>{c.libelle}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Type de produit</Form.Label>
                  <Form.Select value={form.typeProduit} onChange={(e) => setForm({ ...form, typeProduit: e.target.value as any })}>
                    <option value="FABRIQUE">Fabriqué</option>
                    <option value="REVENTE">Revente</option>
                    <option value="MIXTE">Mixte</option>
                  </Form.Select>
                </Form.Group>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Prix d'achat <small className="text-muted">(indicatif, facultatif)</small></Form.Label>
                  <Form.Control
                    type="number" min={0}
                    value={form.prixAchat}
                    onChange={(e) => setForm({ ...form, prixAchat: e.target.value })}
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Prix de vente (FCFA) *</Form.Label>
                  <Form.Control
                    type="number" min={0} required
                    value={form.prixVente}
                    onChange={(e) => setForm({ ...form, prixVente: e.target.value })}
                  />
                </Form.Group>
              </div>
            </div>
            {form.typeProduit === 'REVENTE' && (
              <Form.Group className="mb-3">
                <Form.Label>Seuil d'alerte stock bas <small className="text-muted">(facultatif — si gestion de stock activée)</small></Form.Label>
                <Form.Control
                  type="number" min={0}
                  value={form.seuilAlerte}
                  onChange={(e) => setForm({ ...form, seuilAlerte: e.target.value })}
                  placeholder="Ex : 10 — alerte quand le stock atteint ce niveau"
                />
              </Form.Group>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Form.Group>

            {kiosques.length > 0 && (
              <Form.Group className="mb-3">
                <Form.Label>
                  Prix par kiosque <small className="text-muted">(vide = prix commun)</small>
                </Form.Label>
                <div className="border rounded p-2" style={{ maxHeight: 150, overflowY: 'auto' }}>
                  {kiosques.map((k) => (
                    <div key={k._id} className="d-flex align-items-center gap-2 mb-1">
                      <span className="small flex-grow-1">{k.code} — {k.designation}</span>
                      <Form.Control
                        type="number" min={0} size="sm" style={{ width: 120 }}
                        placeholder={form.prixVente || 'Prix commun'}
                        value={prixKiosques[k._id] ?? ''}
                        onChange={(e) => setPrixKiosques((pk) => ({ ...pk, [k._id]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </Form.Group>
            )}

            <Form.Group>
              <Form.Label>Image <small className="text-muted">(max 500 Ko)</small></Form.Label>
              <div className="d-flex align-items-center gap-3">
                {form.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.image} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                )}
                <Form.Control type="file" accept="image/*" onChange={chargerImage} />
                {form.image && (
                  <Button variant="outline-danger" size="sm" type="button" onClick={() => setForm({ ...form, image: '' })}>
                    <i className="bi bi-x-lg"></i>
                  </Button>
                )}
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </div>
  );
}

export default function ProduitsPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'comptable']} allowedActions={['gerer_produits']}>
      <ProduitsInner />
    </RoleGuard>
  );
}
