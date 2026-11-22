'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, Card, Col, Form, InputGroup, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import Link from 'next/link';
import { useLecture } from '@/hooks/useLecture';
import { useReactToPrint } from 'react-to-print';
import RoleGuard from '@/components/RoleGuard';
import TicketVente from '@/components/ventes/TicketVente';
import { useKiosque } from '@/hooks/useKiosque';
import { useAuthUser } from '@/hooks/useAuthUser';
import { fmtMontant, MODES_PAIEMENT } from '@/lib/format';
import type { CategorieDTO, ListeProduits, ProduitDTO } from '@/types/catalogue';
import type { ClientDTO, TicketVente as TicketData, VenteDTO } from '@/types/ventes';

interface LignePanier {
  produitId: string;
  code: string;
  designation: string;
  prixUnitaire: number; // affichage uniquement — le serveur recalcule
  quantite: number;
}

interface LignePaiement {
  mode: string;
  montant: string;
  montantRecu: string;
}

/** Prix affiché au vendeur : surcharge kiosque si définie, sinon prix commun. */
function prixApplique(p: ProduitDTO, kiosqueId: string): number {
  const pk = (p.prixKiosques || []).find((x) => x.kiosqueId === kiosqueId);
  return pk ? pk.prixVente : p.prixVente;
}

function PosInner() {
  const { kiosqueId, kiosques, loading: chargKiosques } = useKiosque();
  const { user, aAction, actualiserNotifications } = useAuthUser();
  const lire = useLecture(kiosqueId);

  // Catalogue
  const [categories, setCategories] = useState<CategorieDTO[]>([]);
  const [produits, setProduits] = useState<ProduitDTO[]>([]);
  const [chargementProduits, setChargementProduits] = useState(true);
  const [q, setQ] = useState('');
  const [qRecherche, setQRecherche] = useState('');
  const [categorieId, setCategorieId] = useState('');

  // Panier — modifiable AVANT validation uniquement
  const [panier, setPanier] = useState<LignePanier[]>([]);
  const [typeVente, setTypeVente] = useState<'comptant' | 'credit'>('comptant');

  // Client (obligatoire si crédit)
  const [clients, setClients] = useState<ClientDTO[]>([]);
  const [clientId, setClientId] = useState('');
  const [rechercheClient, setRechercheClient] = useState('');
  const [showClientModal, setShowClientModal] = useState(false);
  const [nouvClient, setNouvClient] = useState({ nom: '', prenoms: '', telephone: '' });

  // Paiements (mixte possible)
  const [paiements, setPaiements] = useState<LignePaiement[]>([
    { mode: 'Espèces', montant: '', montantRecu: '' },
  ]);

  // Caisse : la vente exige une session ouverte (contrôle serveur +
  // bandeau bloquant ici). null = pas encore vérifié.
  const [caisseOuverte, setCaisseOuverte] = useState<boolean | null>(null);

  useEffect(() => {
    setCaisseOuverte(null);
    if (!kiosqueId) return;
    void lire(`/api/caisses/actuelle?kiosqueId=${kiosqueId}`,
      (data) => setCaisseOuverte(data?.session?.statut === 'ouverte'),
      () => setCaisseOuverte(true)); // le serveur re-tranchera
  }, [kiosqueId, lire]);

  // Validation + ticket
  const [enCours, setEnCours] = useState(false);
  const [ticket, setTicket] = useState<TicketData | null>(null);
  // Impression automatique : le ticket est rendu HORS ÉCRAN et imprimé
  // directement — jamais de modale d'aperçu dans ce mode.
  const [ticketAuto, setTicketAuto] = useState<TicketData | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const ticketAutoRef = useRef<HTMLDivElement>(null);
  const imprimer = useReactToPrint({ contentRef: ticketRef });
  const imprimerAuto = useReactToPrint({ contentRef: ticketAutoRef });
  useEffect(() => {
    if (!ticketAuto) return;
    const id = window.setTimeout(() => imprimerAuto(), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketAuto]);

  // Clé d'idempotence : une par panier, régénérée après chaque vente —
  // interdit la double validation même en cas de double-clic ou renvoi.
  const cleIdempotence = useRef<string>(crypto.randomUUID());
  const regenererCle = () => { cleIdempotence.current = crypto.randomUUID(); };

  const peutCrediter = aAction('vente_credit');

  // ---------- Chargements ----------

  useEffect(() => {
    axios.get('/api/categories', { withCredentials: true })
      .then((res) => setCategories((res.data?.categories || []).filter((c: CategorieDTO) => c.statut !== 'inactif')))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQRecherche(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setChargementProduits(true);
    const params = new URLSearchParams({ limit: '60', statut: 'actif' });
    if (qRecherche) params.set('q', qRecherche);
    if (categorieId) params.set('categorieId', categorieId);
    void lire<ListeProduits>(`/api/produits?${params}`, (data) => setProduits(data.produits),
      () => toast.error('Erreur de chargement des produits'), () => setChargementProduits(false));
  }, [qRecherche, categorieId, kiosqueId, lire]);

  // Recherche clients (vente à crédit)
  useEffect(() => {
    if (typeVente !== 'credit') return;
    const t = setTimeout(() => {
      void lire(`/api/clients?recherche=1&q=${encodeURIComponent(rechercheClient)}`,
        (data) => setClients(data?.clients || []));
    }, 300);
    return () => clearTimeout(t);
  }, [rechercheClient, typeVente, kiosqueId, lire]);

  // ---------- Panier ----------

  const total = useMemo(
    () => panier.reduce((s, l) => s + l.prixUnitaire * l.quantite, 0),
    [panier]
  );
  const totalPaye = useMemo(
    () => paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0),
    [paiements]
  );
  const monnaie = useMemo(
    () =>
      paiements.reduce((s, p) => {
        const recu = Number(p.montantRecu) || 0;
        const m = Number(p.montant) || 0;
        return p.mode === 'Espèces' && recu > m ? s + recu - m : s;
      }, 0),
    [paiements]
  );

  const ajouter = (p: ProduitDTO) => {
    setPanier((prev) => {
      const i = prev.findIndex((l) => l.produitId === p._id);
      if (i >= 0) {
        const copie = [...prev];
        copie[i] = { ...copie[i], quantite: copie[i].quantite + 1 };
        return copie;
      }
      return [
        ...prev,
        {
          produitId: p._id,
          code: p.code,
          designation: p.designation,
          prixUnitaire: prixApplique(p, kiosqueId),
          quantite: 1,
        },
      ];
    });
  };

  const changerQte = (produitId: string, delta: number) =>
    setPanier((prev) =>
      prev
        .map((l) =>
          l.produitId === produitId
            ? { ...l, quantite: Math.max(0, l.quantite + delta) }
            : l
        )
        .filter((l) => l.quantite > 0)
    );

  const retirer = (produitId: string) =>
    setPanier((prev) => prev.filter((l) => l.produitId !== produitId));

  const vider = () => {
    setPanier([]);
    setClientId('');
    setPaiements([{ mode: 'Espèces', montant: '', montantRecu: '' }]);
    setTypeVente('comptant');
    montantSaisi.current = false;
    regenererCle();
  };

  // Vente au comptant avec un seul mode de paiement : le montant suit
  // automatiquement le total du panier, tant que le caissier ne l'a pas
  // saisi lui-même (vider le champ réactive le suivi automatique).
  const montantSaisi = useRef(false);
  useEffect(() => {
    if (typeVente !== 'comptant' || montantSaisi.current) return;
    setPaiements((prev) => {
      const montant = total > 0 ? String(total) : '';
      return prev.length === 1 && prev[0].montant !== montant ? [{ ...prev[0], montant }] : prev;
    });
  }, [total, typeVente]);

  // Paiement mixte : la première ligne sans montant prend automatiquement
  // le reste à encaisser (total − somme des montants déjà saisis).
  const ajusterRestant = useCallback((liste: LignePaiement[]) => {
    const j = liste.findIndex((p) => p.montant === '');
    if (j < 0) return liste;
    const saisi = liste.reduce((s, p) => s + (Number(p.montant) || 0), 0);
    const restant = Math.max(0, total - saisi);
    if (restant <= 0) return liste;
    const copie = [...liste];
    copie[j] = { ...copie[j], montant: String(restant) };
    return copie;
  }, [total]);

  useEffect(() => {
    const proteger = (e: Event) => {
      if (enCours || (panier.length > 0 && !window.confirm('Un panier est en cours. Le vider et continuer ?'))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else if (panier.length > 0) vider();
    };
    const naviguer = (e: MouseEvent) => {
      const lien = (e.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (lien && lien.origin === window.location.origin && lien.pathname !== window.location.pathname) proteger(e);
    };
    const quitter = (e: BeforeUnloadEvent) => {
      if (enCours || panier.length > 0) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('ek-kiosque-avant-changement', proteger);
    window.addEventListener('click', naviguer, true);
    window.addEventListener('beforeunload', quitter);
    return () => {
      window.removeEventListener('ek-kiosque-avant-changement', proteger);
      window.removeEventListener('click', naviguer, true);
      window.removeEventListener('beforeunload', quitter);
    };
  }, [panier.length, enCours]);

  // ---------- Validation ----------

  const valider = async () => {
    if (!user?.entrepriseId) return toast.warning('Session entreprise requise.');
    if (!kiosqueId) return toast.warning('Sélectionnez un kiosque.');
    if (panier.length === 0) return toast.warning('Le panier est vide.');
    if (typeVente === 'credit' && !clientId) {
      return toast.warning('Sélectionnez un client pour une vente à crédit.');
    }
    if (enCours) return; // anti double-clic
    setEnCours(true);
    try {
      const body = {
        kiosqueId,
        clientId: clientId || null,
        typeVente,
        lignes: panier.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
        paiements: paiements
          .filter((p) => Number(p.montant) > 0)
          .map((p) => ({
            mode: p.mode,
            montant: Number(p.montant),
            ...(p.mode === 'Espèces' && p.montantRecu
              ? { montantRecu: Number(p.montantRecu) }
              : {}),
          })),
        idempotencyKey: cleIdempotence.current,
      };

      // Hors-ligne : la vente part en file locale (même clé d'idempotence
      // → synchronisée sans doublon au retour du réseau)
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { ajouterVenteHorsLigne } = await import('@/lib/offlineQueue');
        ajouterVenteHorsLigne(body, total, user);
        toast.info('Hors-ligne : vente conservée localement, synchronisation au retour du réseau');
        vider();
        return;
      }

      const res = await axios.post<{ vente: VenteDTO }>(
        '/api/ventes',
        body,
        { withCredentials: true }
      );
      const vente = res.data.vente;
      toast.success(`Vente ${vente.numeroVente} enregistrée`);
      actualiserNotifications();
      // On vide le panier tout de suite : la vente est validée côté serveur,
      // un second clic ne doit plus rien renvoyer pendant la suite.
      vider();
      // Ticket chargé à part : son échec ou sa lenteur ne doit JAMAIS
      // ressembler à un échec de vente (la vente est déjà enregistrée).
      try {
        const t = await axios.get(`/api/ventes/${vente._id}/ticket`, { withCredentials: true, timeout: 20000 });
        // Réglage entreprise : impression directe sans aperçu, sinon modale.
        if (t.data?.ticket?.impression?.impressionAuto) {
          setTicketAuto(t.data.ticket);
        } else {
          setTicket(t.data.ticket);
        }
      } catch {
        toast.warning("Ticket indisponible pour l'instant — réimprimez-le depuis « Mes ventes / historique ».");
      }
    } catch (e: any) {
      // Erreur réseau sans réponse serveur (coupure en pleine requête) :
      // file hors-ligne — l'idempotence évite le doublon si la requête
      // avait en réalité abouti côté serveur.
      if (!e?.response) {
        const { ajouterVenteHorsLigne } = await import('@/lib/offlineQueue');
        ajouterVenteHorsLigne(
          {
            kiosqueId,
            clientId: clientId || null,
            typeVente,
            lignes: panier.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
            paiements: paiements
              .filter((p) => Number(p.montant) > 0)
              .map((p) => ({
                mode: p.mode,
                montant: Number(p.montant),
                ...(p.mode === 'Espèces' && p.montantRecu ? { montantRecu: Number(p.montantRecu) } : {}),
              })),
            idempotencyKey: cleIdempotence.current,
          },
          total,
          user
        );
        toast.info('Connexion perdue : vente conservée localement, synchronisation au retour du réseau');
        vider();
      } else {
        if (e?.response?.data?.code === 'CAISSE_FERMEE') setCaisseOuverte(false);
        toast.error(e?.response?.data?.message || "Erreur lors de l'enregistrement");
      }
    } finally {
      setEnCours(false);
    }
  };

  const creerClient = async () => {
    if (!nouvClient.nom.trim()) return toast.warning('Nom du client requis.');
    try {
      const res = await axios.post('/api/clients', nouvClient, { withCredentials: true });
      const c: ClientDTO = res.data.client;
      setClients((prev) => [c, ...prev]);
      setClientId(c._id);
      setShowClientModal(false);
      setNouvClient({ nom: '', prenoms: '', telephone: '' });
      toast.success(`Client ${c.code} créé`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur création client');
    }
  };

  const clientChoisi = clients.find((c) => c._id === clientId);
  const kiosqueActuel = kiosques.find((k) => k._id === kiosqueId);

  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'caissier', 'vendeur']} allowedActions={['enregistrer_vente']}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">
          <i className="bi bi-cart3 me-2"></i>Point de vente
          {kiosqueActuel && (
            <Badge bg="success" className="ms-2">{kiosqueActuel.designation}</Badge>
          )}
        </h4>
        <Link href="/dashboard/ventes/historique" className="btn btn-outline-secondary btn-sm">
          <i className="bi bi-clock-history me-1"></i>Mes ventes / historique
        </Link>
      </div>

      {kiosqueId && caisseOuverte === false && (
        <div className="alert alert-warning d-flex align-items-center gap-2 mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill fs-5"></i>
          <div>
            <strong>Caisse fermée.</strong> Aucune vente ne peut être enregistrée tant que la caisse
            de ce kiosque n&apos;est pas ouverte.
            <Link href="/dashboard/caisse" className="alert-link ms-2">Ouvrir la caisse</Link>
          </div>
        </div>
      )}

      <Row className="g-3">
        {/* ============ ZONE 1 : produits ============ */}
        <Col lg={7} xl={8}>
          <Card className="h-100">
            <Card.Body>
              <Row className="g-2 mb-3">
                <Col md={6}>
                  <InputGroup size="sm">
                    <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
                    <Form.Control
                      placeholder="Rechercher un produit…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </InputGroup>
                </Col>
                <Col md={6}>
                  <Form.Select
                    size="sm"
                    value={categorieId}
                    onChange={(e) => setCategorieId(e.target.value)}
                  >
                    <option value="">Toutes les catégories</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>{c.libelle}</option>
                    ))}
                  </Form.Select>
                </Col>
              </Row>

              {chargementProduits ? (
                <div className="text-center py-5"><Spinner animation="border" /></div>
              ) : produits.length === 0 ? (
                <div className="text-center text-muted py-5">
                  Aucun produit actif. Le propriétaire configure le catalogue
                  dans « Produits ».
                </div>
              ) : (
                <Row xs={2} sm={3} xl={4} className="g-2">
                  {produits.map((p) => (
                    <Col key={p._id}>
                      <Card
                        role="button"
                        className="h-100 text-center"
                        onClick={() => ajouter(p)}
                      >
                        {p.image && (
                          <Card.Img
                            variant="top"
                            src={p.image}
                            style={{ height: 70, objectFit: 'cover' }}
                          />
                        )}
                        <Card.Body className="p-2">
                          <div className="small fw-semibold text-truncate" title={p.designation}>
                            {p.designation}
                          </div>
                          <div className="text-success fw-bold">
                            {fmtMontant(prixApplique(p, kiosqueId))} F
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            {p.code}
                          </div>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* ============ ZONES 2+3 : panier + paiement ============ */}
        <Col lg={5} xl={4}>
          <Card className="mb-3">
            <Card.Header className="fw-semibold py-2">
              <i className="bi bi-basket me-2"></i>Panier
              {panier.length > 0 && (
                <button className="btn btn-link btn-sm text-danger float-end p-0" onClick={vider}>
                  Vider
                </button>
              )}
            </Card.Header>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              <Table size="sm" className="mb-0 align-middle">
                <tbody>
                  {panier.length === 0 && (
                    <tr><td className="text-center text-muted py-4">Panier vide</td></tr>
                  )}
                  {panier.map((l) => (
                    <tr key={l.produitId}>
                      <td>
                        <div className="small fw-semibold">{l.designation}</div>
                        <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                          {fmtMontant(l.prixUnitaire)} F
                        </div>
                      </td>
                      <td style={{ width: 110 }}>
                        <InputGroup size="sm">
                          <Button variant="outline-secondary" onClick={() => changerQte(l.produitId, -1)}>−</Button>
                          <Form.Control
                            className="text-center px-1"
                            value={l.quantite}
                            onChange={(e) => {
                              const n = Math.max(0, parseInt(e.target.value) || 0);
                              setPanier((prev) =>
                                prev
                                  .map((x) => (x.produitId === l.produitId ? { ...x, quantite: n } : x))
                                  .filter((x) => x.quantite > 0)
                              );
                            }}
                          />
                          <Button variant="outline-secondary" onClick={() => changerQte(l.produitId, 1)}>+</Button>
                        </InputGroup>
                      </td>
                      <td className="text-end fw-semibold" style={{ whiteSpace: 'nowrap' }}>
                        {fmtMontant(l.prixUnitaire * l.quantite)}
                      </td>
                      <td style={{ width: 30 }}>
                        <Button variant="link" className="text-danger p-0" onClick={() => retirer(l.produitId)}>
                          <i className="bi bi-x-lg"></i>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <Card.Footer className="d-flex justify-content-between fw-bold fs-5">
              <span>Total</span>
              <span className="text-success">{fmtMontant(total)} F</span>
            </Card.Footer>
          </Card>

          <Card>
            <Card.Header className="fw-semibold py-2">
              <i className="bi bi-credit-card me-2"></i>Paiement
            </Card.Header>
            <Card.Body>
              <div className="btn-group w-100 mb-3" role="group">
                <Button
                  size="sm"
                  variant={typeVente === 'comptant' ? 'success' : 'outline-success'}
                  onClick={() => { montantSaisi.current = false; setTypeVente('comptant'); }}
                >
                  Comptant
                </Button>
                <Button
                  size="sm"
                  variant={typeVente === 'credit' ? 'success' : 'outline-success'}
                  onClick={() => {
                    if (!peutCrediter) {
                      return toast.warning("Vous n'êtes pas autorisé à vendre à crédit.");
                    }
                    setTypeVente('credit');
                  }}
                >
                  Crédit
                </Button>
              </div>

              {typeVente === 'credit' && (
                <div className="mb-3">
                  <Form.Label className="small fw-semibold mb-1">
                    Client <span className="text-danger">*</span>
                  </Form.Label>
                  <InputGroup size="sm">
                    <Form.Select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    >
                      <option value="">— Choisir un client —</option>
                      {clients.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.code} · {c.nom} {c.prenoms || ''}
                          {c.soldeDu ? ` (dû : ${fmtMontant(c.soldeDu)} F)` : ''}
                        </option>
                      ))}
                    </Form.Select>
                    <Button variant="outline-primary" onClick={() => setShowClientModal(true)} title="Nouveau client">
                      <i className="bi bi-person-plus"></i>
                    </Button>
                  </InputGroup>
                  <Form.Control
                    size="sm"
                    className="mt-1"
                    placeholder="Rechercher un client…"
                    value={rechercheClient}
                    onChange={(e) => setRechercheClient(e.target.value)}
                  />
                  {clientChoisi?.plafondCredit != null && (
                    <div className="small text-muted mt-1">
                      Plafond : {fmtMontant(clientChoisi.plafondCredit)} F — encours : {fmtMontant(clientChoisi.soldeDu || 0)} F
                    </div>
                  )}
                </div>
              )}

              {paiements.map((p, i) => (
                <div key={i} className="border rounded p-2 mb-2">
                  <div className="d-flex gap-2">
                    <Form.Select
                      size="sm"
                      value={p.mode}
                      onChange={(e) =>
                        setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))
                      }
                    >
                      {MODES_PAIEMENT.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </Form.Select>
                    {paiements.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => setPaiements((prev) => prev.filter((_, j) => j !== i))}
                      >
                        <i className="bi bi-trash"></i>
                      </Button>
                    )}
                  </div>
                  <div className="d-flex gap-2 mt-2">
                    <Form.Control
                      size="sm"
                      type="number"
                      min={0}
                      placeholder="Montant"
                      value={p.montant}
                      onChange={(e) => {
                        montantSaisi.current = e.target.value !== '';
                        let v = e.target.value;
                        setPaiements((prev) => {
                          // Un montant ne dépasse jamais le reste à payer
                          // (total − somme des autres lignes).
                          const autres = prev.reduce((s, x, j) => (j === i ? s : s + (Number(x.montant) || 0)), 0);
                          const restant = Math.max(0, total - autres);
                          if (v !== '' && Number(v) > restant) v = String(restant);
                          const maj = prev.map((x, j) => (j === i ? { ...x, montant: v } : x));
                          // Champ vidé pour ressaisie : ne pas le re-remplir
                          // tout de suite ; le reste complète les autres lignes.
                          return v === '' ? maj : ajusterRestant(maj);
                        });
                      }}
                    />
                    {p.mode === 'Espèces' && (
                      <Form.Control
                        size="sm"
                        type="number"
                        min={0}
                        placeholder="Reçu"
                        value={p.montantRecu}
                        onChange={(e) =>
                          setPaiements((prev) => prev.map((x, j) => (j === i ? { ...x, montantRecu: e.target.value } : x)))
                        }
                      />
                    )}
                  </div>
                </div>
              ))}

              <div className="d-flex justify-content-between align-items-center mb-2">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  onClick={() => setPaiements((prev) => ajusterRestant([...prev, { mode: 'Orange Money', montant: '', montantRecu: '' }]))}
                  disabled={paiements.length >= 4 || total - totalPaye <= 0}
                >
                  <i className="bi bi-plus-lg me-1"></i>Paiement mixte
                </Button>
                <div className="small">
                  Encaissé : <strong>{fmtMontant(totalPaye)} F</strong>
                  {monnaie > 0 && <span className="text-muted"> · monnaie {fmtMontant(monnaie)} F</span>}
                </div>
              </div>

              {typeVente === 'comptant' && totalPaye !== total && total > 0 && (
                <div className="small text-warning mb-2">
                  <i className="bi bi-exclamation-triangle me-1"></i>
                  L'encaissé doit égaler le total ({fmtMontant(total - totalPaye)} F restants).
                </div>
              )}
              {typeVente === 'credit' && totalPaye > 0 && (
                <div className="small text-muted mb-2">
                  Acompte : {fmtMontant(totalPaye)} F — reste dû : {fmtMontant(Math.max(0, total - totalPaye))} F
                </div>
              )}

              <Button
                variant="success"
                className="w-100"
                size="lg"
                disabled={enCours || panier.length === 0 || chargKiosques || caisseOuverte === false}
                onClick={valider}
              >
                {enCours ? (
                  <><Spinner animation="border" size="sm" className="me-2" />Validation…</>
                ) : (
                  <><i className="bi bi-check2-circle me-2"></i>Valider la vente</>
                )}
              </Button>
              {/* Pourquoi le bouton est grisé — le clic sur un bouton désactivé
                  ne fait rien : il faut dire à l'opérateur ce qui manque. */}
              {!enCours && (chargKiosques || panier.length === 0 || caisseOuverte === false || !kiosqueId) && (
                <div className="small text-muted text-center mt-2">
                  {chargKiosques
                    ? 'Chargement des kiosques…'
                    : !kiosqueId
                      ? 'Sélectionnez un kiosque pour vendre.'
                      : caisseOuverte === false
                        ? 'Ouvrez la caisse du kiosque pour vendre.'
                        : 'Ajoutez des produits au panier.'}
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Modale nouveau client (vente à crédit) */}
      <Modal show={showClientModal} onHide={() => setShowClientModal(false)} size="sm" centered>
        <Modal.Header closeButton><Modal.Title>Nouveau client</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-2">
            <Form.Label className="small">Nom *</Form.Label>
            <Form.Control size="sm" value={nouvClient.nom}
              onChange={(e) => setNouvClient({ ...nouvClient, nom: e.target.value })} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small">Prénoms</Form.Label>
            <Form.Control size="sm" value={nouvClient.prenoms}
              onChange={(e) => setNouvClient({ ...nouvClient, prenoms: e.target.value })} />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small">Téléphone</Form.Label>
            <Form.Control size="sm" value={nouvClient.telephone}
              onChange={(e) => setNouvClient({ ...nouvClient, telephone: e.target.value })} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowClientModal(false)}>Annuler</Button>
          <Button variant="primary" size="sm" onClick={creerClient}>Créer</Button>
        </Modal.Footer>
      </Modal>

      {/* Ticket hors-écran — impression directe sans aperçu */}
      <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        {ticketAuto && <TicketVente ref={ticketAutoRef} ticket={ticketAuto} />}
      </div>

      {/* Modale ticket */}
      <Modal show={!!ticket} onHide={() => setTicket(null)} centered>
        <Modal.Header closeButton><Modal.Title>Vente enregistrée</Modal.Title></Modal.Header>
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

export default function PageVentes() {
  return <PosInner />;
}
