'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import RoleGuard from '@/components/RoleGuard';
import { fmtDate } from '@/lib/format';

interface Entreprise {
  _id: string;
  nomSociete: string;
  nomCommercial?: string;
  telephone?: string;
  email?: string;
  adresse?: string;
  ville?: string;
  pays?: string;
  devise?: string;
  statut?: string;
  impression?: { imprimanteDefaut?: string; format?: string };
  createdAt?: string;
}

function EntrepriseInner() {
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [form, setForm] = useState<Partial<Entreprise>>({});
  const [chargement, setChargement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [peutModifier, setPeutModifier] = useState(false);

  const charger = useCallback(() => {
    setChargement(true);
    axios
      .get('/api/entreprises/moi', { withCredentials: true })
      .then((res) => {
        setEntreprise(res.data?.entreprise || null);
        setForm(res.data?.entreprise || {});
      })
      .catch(() => toast.error("Erreur de chargement de l'entreprise"))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => {
    charger();
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const u = data?.user;
        setPeutModifier(
          !!u &&
            (u.type === 'admin' ||
              u.type === 'gestionnaire' ||
              u.permissions?.actions?.includes('*') ||
              u.permissions?.actions?.includes('parametrage_general'))
        );
      })
      .catch(() => {});
  }, [charger]);

  const set = (k: keyof Entreprise) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await axios.put('/api/entreprises/moi', {
        nomSociete: form.nomSociete,
        nomCommercial: form.nomCommercial,
        telephone: form.telephone,
        email: form.email,
        adresse: form.adresse,
        ville: form.ville,
        pays: form.pays,
        devise: form.devise,
        impression: {
          imprimanteDefaut: form.impression?.imprimanteDefaut || '',
          format: form.impression?.format || 'thermique80',
        },
      }, { withCredentials: true });
      setEntreprise(res.data?.entreprise || null);
      toast.success('Fiche entreprise enregistrée');
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  if (chargement) {
    return <div className="text-center p-5"><div className="spinner-border text-primary"></div></div>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Paramètres — Entreprise</h3>
        {entreprise?.statut && (
          <Badge bg={entreprise.statut === 'actif' ? 'success' : 'danger'} className="fs-6">
            Compte {entreprise.statut === 'actif' ? 'actif' : 'suspendu'}
          </Badge>
        )}
      </div>

      <Card>
        <Card.Body>
          <Form onSubmit={enregistrer}>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Raison sociale / nom du propriétaire *</Form.Label>
                  <Form.Control
                    value={form.nomSociete || ''}
                    onChange={set('nomSociete')}
                    disabled={!peutModifier}
                    required
                  />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Nom commercial</Form.Label>
                  <Form.Control value={form.nomCommercial || ''} onChange={set('nomCommercial')} disabled={!peutModifier} />
                </Form.Group>
              </div>
            </div>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Téléphone</Form.Label>
                  <Form.Control value={form.telephone || ''} onChange={set('telephone')} disabled={!peutModifier} />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Email</Form.Label>
                  <Form.Control type="email" value={form.email || ''} onChange={set('email')} disabled={!peutModifier} />
                </Form.Group>
              </div>
            </div>
            <Form.Group className="mb-3">
              <Form.Label>Adresse</Form.Label>
              <Form.Control value={form.adresse || ''} onChange={set('adresse')} disabled={!peutModifier} />
            </Form.Group>
            <div className="row">
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Ville</Form.Label>
                  <Form.Control value={form.ville || ''} onChange={set('ville')} disabled={!peutModifier} />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Pays</Form.Label>
                  <Form.Control value={form.pays || ''} onChange={set('pays')} disabled={!peutModifier} />
                </Form.Group>
              </div>
              <div className="col-md-4">
                <Form.Group className="mb-3">
                  <Form.Label>Devise</Form.Label>
                  <Form.Control value={form.devise || 'FCFA'} onChange={set('devise')} disabled={!peutModifier} />
                </Form.Group>
              </div>
            </div>

            <hr />
            <h6 className="fw-semibold mb-3"><i className="bi bi-printer me-2"></i>Impression des tickets et reçus</h6>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Imprimante par défaut</Form.Label>
                  <Form.Control
                    value={form.impression?.imprimanteDefaut || ''}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        impression: { ...f.impression, imprimanteDefaut: e.target.value },
                      }))
                    }
                    disabled={!peutModifier}
                    placeholder="Ex : EPSON TM-T20III, imprimante bureau…"
                  />
                  <Form.Text className="text-muted">
                    Nom repère de l'imprimante utilisée au kiosque (thermique ou classique).
                  </Form.Text>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Format des reçus</Form.Label>
                  <Form.Select
                    value={form.impression?.format || 'thermique80'}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        impression: { ...f.impression, format: e.target.value },
                      }))
                    }
                    disabled={!peutModifier}
                  >
                    <option value="thermique80">Ticket thermique 80 mm</option>
                    <option value="a4">Page A4 (imprimante classique)</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    S'applique aux tickets de vente et aux reçus de remboursement.
                  </Form.Text>
                </Form.Group>
              </div>
            </div>

            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2">
              <small className="text-muted">
                Compte créé le {fmtDate(entreprise?.createdAt)}
              </small>
              {peutModifier && (
                <Button variant="primary" type="submit" disabled={saving}>
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}

export default function EntreprisePage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire']} allowedActions={['parametrage_general']}>
      <EntrepriseInner />
    </RoleGuard>
  );
}
