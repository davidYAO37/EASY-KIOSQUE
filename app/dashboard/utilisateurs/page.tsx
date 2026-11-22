'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Modal, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import axios from 'axios';
import { useAuthUser } from '@/hooks/useAuthUser';
import { useLecture } from '@/hooks/useLecture';
import RoleGuard from '@/components/RoleGuard';
import PermissionsModal, { type PermissionsValue } from '@/components/PermissionsModal';
import { ROLE_LABELS, TENANT_ROLES } from '@/lib/permissions';

interface KiosqueLite { _id: string; code: string; designation: string }
interface ProfilLite { _id: string; profil: string; type?: string }
interface Utilisateur {
  _id: string;
  nom?: string;
  prenom?: string;
  email: string;
  type?: string;
  kiosqueIds?: KiosqueLite[] | string[];
  profilId?: ProfilLite | string | null;
  comptebloque?: boolean;
  permissions?: { services?: string[]; actions?: string[]; customized?: boolean };
}

const VIDE = {
  nom: '', prenom: '', email: '', password: '', type: 'caissier',
  profilId: '', comptebloque: false,
};

function UtilisateursInner() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [kiosques, setKiosques] = useState<KiosqueLite[]>([]);
  const [profils, setProfils] = useState<ProfilLite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPerms, setShowPerms] = useState(false);
  const [edition, setEdition] = useState<Utilisateur | null>(null);
  const [form, setForm] = useState(VIDE);
  const [kiosquesSel, setKiosquesSel] = useState<string[]>([]);
  const [perms, setPerms] = useState<PermissionsValue>({ customized: false, services: [], actions: [] });
  const [saving, setSaving] = useState(false);
  const { user, actualiser } = useAuthUser();
  const monId = user?._id || '';
  const lire = useLecture();

  const charger = useCallback(() => {
    setChargement(true);
    void lire('/api/utilisateurs', (data) => setUtilisateurs(data?.utilisateurs || []),
      () => toast.error('Erreur de chargement des utilisateurs'), () => setChargement(false));
  }, [lire]);

  useEffect(() => {
    charger();
    void lire('/api/kiosques', (data) => setKiosques(data?.kiosques || []), () => toast.error('Kiosques indisponibles'));
    void lire('/api/profils', (data) => setProfils(data?.profils || []), () => toast.error('Profils indisponibles'));
  }, [charger]);

  const ouvrir = (u?: Utilisateur) => {
    setEdition(u || null);
    setKiosquesSel(
      u?.kiosqueIds?.map((k: any) => (typeof k === 'string' ? k : k._id)) || []
    );
    setPerms({
      customized: !!u?.permissions?.customized,
      services: u?.permissions?.services || [],
      actions: u?.permissions?.actions || [],
    });
    setForm(
      u
        ? {
            nom: u.nom || '',
            prenom: u.prenom || '',
            email: u.email || '',
            password: '',
            type: u.type || 'caissier',
            profilId: typeof u.profilId === 'object' && u.profilId ? u.profilId._id : '',
            comptebloque: !!u.comptebloque,
          }
        : VIDE
    );
    setShowModal(true);
  };

  const enregistrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        nom: form.nom,
        prenom: form.prenom,
        email: form.email,
        type: form.type,
        kiosqueIds: kiosquesSel,
        profilId: form.profilId || null,
        comptebloque: form.comptebloque,
        permissions: perms,
      };
      if (form.password) payload.password = form.password;
      if (edition) {
        await axios.put(`/api/utilisateurs/${edition._id}`, payload, { withCredentials: true });
        toast.success('Utilisateur modifié');
      } else {
        payload.password = form.password;
        await axios.post('/api/utilisateurs', payload, { withCredentials: true });
        toast.success('Utilisateur créé');
      }
      setShowModal(false);
      charger();
      if (edition?._id === monId) void actualiser();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const supprimer = async (u: Utilisateur) => {
    if (!confirm(`Supprimer l'utilisateur « ${u.nom} ${u.prenom || ''} » ?`)) return;
    try {
      await axios.delete(`/api/utilisateurs/${u._id}`, { withCredentials: true });
      toast.success('Utilisateur supprimé');
      charger();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Erreur');
    }
  };

  const kiosquesDe = (u: Utilisateur) =>
    (u.kiosqueIds || [])
      .map((k: any) => (typeof k === 'string' ? k : `${k.code} ${k.designation}`))
      .join(', ');

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
        <h3 className="titre-page mb-0">Utilisateurs</h3>
        <Button variant="primary" onClick={() => ouvrir()}>
          <i className="bi bi-person-plus me-2"></i>Nouvel utilisateur
        </Button>
      </div>

      <Card>
        <Card.Body className="p-0">
          <Table responsive hover className="mb-0 align-middle" aria-busy={chargement}>
            {chargement && <caption className="caption-top small">Actualisation…</caption>}
            <thead className="table-light">
              <tr>
                <th>Nom</th>
                <th>Identifiant</th>
                <th>Rôle</th>
                <th>Kiosques affectés</th>
                <th>Profil</th>
                <th>Statut</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chargement && utilisateurs.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-4">Chargement...</td></tr>
              ) : utilisateurs.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-4 text-muted">Aucun utilisateur.</td></tr>
              ) : (
                utilisateurs.map((u) => (
                  <tr key={u._id}>
                    <td className="fw-semibold">
                      {u.nom} {u.prenom}
                      {u._id === monId && <Badge bg="info" className="ms-2" text="dark">moi</Badge>}
                    </td>
                    <td>{u.email}</td>
                    <td><Badge bg="primary">{ROLE_LABELS[u.type || ''] || u.type}</Badge></td>
                    <td>
                      {u.kiosqueIds?.length
                        ? kiosquesDe(u)
                        : <span className="text-muted">Tous</span>}
                    </td>
                    <td>{typeof u.profilId === 'object' && u.profilId ? u.profilId.profil : '—'}</td>
                    <td>
                      {u.comptebloque
                        ? <Badge bg="danger">Bloqué</Badge>
                        : <Badge bg="success">Actif</Badge>}
                    </td>
                    <td className="text-end">
                      <Button size="sm" variant="outline-primary" className="me-1" onClick={() => ouvrir(u)}>
                        <i className="bi bi-pencil"></i>
                      </Button>
                      {u._id !== monId && (
                        <Button size="sm" variant="outline-danger" onClick={() => supprimer(u)}>
                          <i className="bi bi-trash"></i>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      <Modal show={showModal} onHide={() => setShowModal(false)} centered size="lg" scrollable>
        <Form onSubmit={enregistrer}>
          <Modal.Header closeButton>
            <Modal.Title>{edition ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Nom *</Form.Label>
                  <Form.Control value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} required />
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Prénoms</Form.Label>
                  <Form.Control value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} />
                </Form.Group>
              </div>
            </div>
            <Form.Group className="mb-3">
              <Form.Label>Email (identifiant) *</Form.Label>
              <Form.Control type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{edition ? 'Nouveau mot de passe (vide = inchangé)' : 'Mot de passe *'}</Form.Label>
              <Form.Control
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                minLength={6}
                required={!edition}
              />
            </Form.Group>
            <div className="row">
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Rôle</Form.Label>
                  <Form.Select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    disabled={edition?._id === monId}
                  >
                    {TENANT_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </div>
              <div className="col-md-6">
                <Form.Group className="mb-3">
                  <Form.Label>Profil de droits</Form.Label>
                  <Form.Select value={form.profilId} onChange={(e) => setForm({ ...form, profilId: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {profils.map((p) => (
                      <option key={p._id} value={p._id}>{p.profil}</option>
                    ))}
                  </Form.Select>
                  <Form.Text className="text-muted">
                    Un profil impose son rôle et ses permissions.
                  </Form.Text>
                </Form.Group>
              </div>
            </div>

            <Form.Group className="mb-3">
              <Form.Label>Kiosques affectés <span className="text-muted">(vide = tous)</span></Form.Label>
              <div className="border rounded p-2" style={{ maxHeight: 140, overflowY: 'auto' }}>
                {kiosques.length === 0 && <span className="text-muted small">Aucun kiosque créé.</span>}
                {kiosques.map((k) => (
                  <Form.Check
                    key={k._id}
                    id={`k-${k._id}`}
                    label={`${k.code} — ${k.designation}`}
                    checked={kiosquesSel.includes(k._id)}
                    onChange={() =>
                      setKiosquesSel((sel) =>
                        sel.includes(k._id) ? sel.filter((x) => x !== k._id) : [...sel, k._id]
                      )
                    }
                  />
                ))}
              </div>
            </Form.Group>

            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
              <Button variant="outline-primary" size="sm" onClick={() => setShowPerms(true)} type="button">
                <i className="bi bi-shield-lock me-1"></i>
                Permissions personnalisées
                {perms.customized && <Badge bg="primary" className="ms-2">actives</Badge>}
              </Button>
              {edition && edition._id !== monId && (
                <Form.Check
                  type="switch"
                  id="comptebloque"
                  label="Compte bloqué"
                  checked={form.comptebloque}
                  onChange={(e) => setForm({ ...form, comptebloque: e.target.checked })}
                />
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Annuler</Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <PermissionsModal
        show={showPerms}
        value={perms}
        onChange={setPerms}
        onClose={() => setShowPerms(false)}
      />
    </div>
  );
}

export default function UtilisateursPage() {
  return (
    <RoleGuard allowedRoles={['gestionnaire']} allowedActions={['gestion_utilisateurs']}>
      <UtilisateursInner />
    </RoleGuard>
  );
}
