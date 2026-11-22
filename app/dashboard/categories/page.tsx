'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Modal, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useLecture } from '@/hooks/useLecture';
import RoleGuard from '@/components/RoleGuard';
import type { CategorieDTO } from '@/types/catalogue';

const VIDE = { code: '', libelle: '', description: '', ordre: 0 };

function CategoriesInner() {
  const [categories, setCategories] = useState<CategorieDTO[]>([]);
  const [chargement, setChargement] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [edition, setEdition] = useState<CategorieDTO | null>(null);
  const [form, setForm] = useState(VIDE);
  const [saving, setSaving] = useState(false);
  const { user, aAction } = useAuthUser();
  const peutGerer = user?.type === 'admin' || user?.type === 'gestionnaire' || aAction('gerer_produits');
  const lire = useLecture();

  const charger = useCallback(() => {
    setChargement(true);
    void lire('/api/categories', (data) => setCategories(data?.categories || []),
      () => toast.error('Erreur de chargement des catégories'), () => setChargement(false));
  }, [lire]);

  useEffect(() => {
    charger();
  }, [charger]);

  const ouvrir = (c?: CategorieDTO) => {
    setEdition(c || null);
    setForm(
      c
        ? { code: c.code || '', libelle: c.libelle || '', description: c.description || '', ordre: c.ordre || 0 }
        : VIDE
    );
    setShowModal(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (edition) {
        await axios.put(`/api/categories/${edition._id}`, form, { withCredentials: true });
        toast.success('Catégorie modifiée');
      } else {
        await axios.post('/api/categories', form, { withCredentials: true });
        toast.success('Catégorie créée');
      }
      setShowModal(false);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const basculer = async (c: CategorieDTO) => {
    try {
      await axios.put(`/api/categories/${c._id}`, {
        statut: c.statut === 'actif' ? 'inactif' : 'actif',
      }, { withCredentials: true });
      toast.success(`Catégorie ${c.statut === 'actif' ? 'désactivée' : 'activée'}`);
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const supprimer = async (c: CategorieDTO) => {
    const msg = (c.nbProduits || 0) > 0
      ? `« ${c.libelle} » est utilisée par ${c.nbProduits} produit(s) : elle sera désactivée. Continuer ?`
      : `Supprimer définitivement « ${c.libelle} » ?`;
    if (!confirm(msg)) return;
    try {
      const res = await axios.delete(`/api/categories/${c._id}`, { withCredentials: true });
      toast.success(res.data?.message || 'Catégorie supprimée');
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Catégories</h3>
        {peutGerer && (
          <Button variant="primary" onClick={() => ouvrir()}>
            <i className="bi bi-plus-lg me-2"></i>Nouvelle catégorie
          </Button>
        )}
      </div>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle" aria-busy={chargement}>
            {chargement && <caption className="caption-top small">Actualisation…</caption>}
            <thead className="table-light">
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th>Description</th>
                <th className="text-center">Ordre</th>
                <th className="text-center">Produits</th>
                <th>Statut</th>
                {peutGerer && <th className="text-end">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {chargement && categories.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-4">Chargement...</td></tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-4 text-muted">
                    Aucune catégorie — créez-en une pour organiser vos produits.
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c._id} className={c.statut === 'inactif' ? 'text-muted' : ''}>
                    <td className="fw-semibold">{c.code}</td>
                    <td>{c.libelle}</td>
                    <td>{c.description || '—'}</td>
                    <td className="text-center">{c.ordre || 0}</td>
                    <td className="text-center"><Badge bg="secondary">{c.nbProduits || 0}</Badge></td>
                    <td>
                      {c.statut === 'actif'
                        ? <Badge bg="success">Active</Badge>
                        : <Badge bg="secondary">Inactive</Badge>}
                    </td>
                    {peutGerer && (
                      <td className="text-end">
                        <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrir(c)}>
                          <i className="bi bi-pencil"></i>
                        </Button>
                        <Button
                          size="sm"
                          variant={c.statut === 'actif' ? 'outline-warning' : 'outline-success'}
                          className="me-1"
                          title={c.statut === 'actif' ? 'Désactiver' : 'Activer'}
                          onClick={() => basculer(c)}
                        >
                          <i className={`bi ${c.statut === 'actif' ? 'bi-pause-circle' : 'bi-play-circle'}`}></i>
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => supprimer(c)}>
                          <i className="bi bi-trash"></i>
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>{edition ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Code</Form.Label>
              <Form.Control
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="Auto (CAT001)"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Libellé *</Form.Label>
              <Form.Control value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Ordre d'affichage</Form.Label>
              <Form.Control
                type="number" min={0}
                value={form.ordre}
                onChange={(e) => setForm({ ...form, ordre: Number(e.target.value) })}
              />
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

export default function CategoriesPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire', 'responsable', 'comptable']} allowedActions={['gerer_produits']}>
      <CategoriesInner />
    </RoleGuard>
  );
}
