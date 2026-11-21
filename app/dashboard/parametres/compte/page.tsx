'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Card, Col, Form, Row, Spinner } from 'react-bootstrap';
import axios from 'axios';
import { toast } from 'react-toastify';

interface UserInfo {
  _id: string;
  nom: string;
  prenom: string;
  email: string;
  type: string;
  telephone?: string | null;
}

const ROLES: Record<string, string> = {
  adminsuper: 'Super-admin plateforme',
  admin: 'Propriétaire',
  gestionnaire: 'Gestionnaire',
  responsable: 'Responsable de kiosque',
  caissier: 'Caissier',
  vendeur: 'Vendeur',
  comptable: 'Comptable',
};

/**
 * « Mon compte » : profil personnel (nom, prénom, téléphone) et
 * changement de mot de passe. Accessible à tous les utilisateurs
 * connectés — pas de RoleGuard.
 */
export default function PageCompte() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [chargement, setChargement] = useState(true);

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [savingProfil, setSavingProfil] = useState(false);

  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [savingMdp, setSavingMdp] = useState(false);

  useEffect(() => {
    axios.get('/api/me', { withCredentials: true })
      .then((res) => {
        const u: UserInfo = res.data.user;
        setUser(u);
        setNom(u.nom || '');
        setPrenom(u.prenom || '');
        setTelephone(u.telephone || '');
      })
      .catch(() => {})
      .finally(() => setChargement(false));
  }, []);

  const enregistrerProfil = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfil(true);
    try {
      await axios.patch('/api/me', { nom, prenom, telephone }, { withCredentials: true });
      toast.success('Profil mis à jour');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur lors de la mise à jour');
    } finally {
      setSavingProfil(false);
    }
  };

  const changerMdp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nouveau !== confirmation) {
      toast.error('La confirmation ne correspond pas au nouveau mot de passe');
      return;
    }
    setSavingMdp(true);
    try {
      await axios.post('/api/me/mot-de-passe', {
        ancienMotDePasse: ancien,
        nouveauMotDePasse: nouveau,
      }, { withCredentials: true });
      toast.success('Mot de passe modifié — vos autres appareils ont été déconnectés');
      setAncien(''); setNouveau(''); setConfirmation('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur lors du changement');
    } finally {
      setSavingMdp(false);
    }
  };

  if (chargement) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="p-3 p-md-4" style={{ maxWidth: 760 }}>
      <h4 className="mb-3"><i className="bi bi-person me-2" />Mon compte</h4>

      <Card className="shadow-sm mb-4">
        <Card.Header className="fw-semibold">Profil</Card.Header>
        <Card.Body>
          <Form onSubmit={enregistrerProfil}>
            <Row className="g-3">
              <Col md={6}>
                <Form.Label>Nom</Form.Label>
                <Form.Control value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={80} />
              </Col>
              <Col md={6}>
                <Form.Label>Prénom</Form.Label>
                <Form.Control value={prenom} onChange={(e) => setPrenom(e.target.value)} required maxLength={80} />
              </Col>
              <Col md={6}>
                <Form.Label>Email</Form.Label>
                <Form.Control value={user?.email || ''} disabled />
                <Form.Text className="text-muted">L&apos;email ne peut pas être modifié.</Form.Text>
              </Col>
              <Col md={6}>
                <Form.Label>Téléphone</Form.Label>
                <Form.Control value={telephone} onChange={(e) => setTelephone(e.target.value)} maxLength={30} />
              </Col>
              <Col md={12}>
                <Form.Label>Rôle</Form.Label>
                <div><Badge bg="secondary">{ROLES[user?.type || ''] || user?.type}</Badge></div>
              </Col>
            </Row>
            <Button type="submit" variant="primary" size="sm" className="mt-3" disabled={savingProfil}>
              {savingProfil ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-check2 me-1" />Enregistrer</>}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      <Card className="shadow-sm">
        <Card.Header className="fw-semibold">
          <i className="bi bi-shield-lock me-2" />Changer le mot de passe
        </Card.Header>
        <Card.Body>
          <Form onSubmit={changerMdp}>
            <Row className="g-3">
              <Col md={12}>
                <Form.Label>Ancien mot de passe</Form.Label>
                <Form.Control type="password" value={ancien} onChange={(e) => setAncien(e.target.value)} required autoComplete="current-password" />
              </Col>
              <Col md={6}>
                <Form.Label>Nouveau mot de passe</Form.Label>
                <Form.Control type="password" value={nouveau} onChange={(e) => setNouveau(e.target.value)} required minLength={6} autoComplete="new-password" />
              </Col>
              <Col md={6}>
                <Form.Label>Confirmation</Form.Label>
                <Form.Control type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required minLength={6} autoComplete="new-password" />
              </Col>
            </Row>
            <Form.Text className="text-muted d-block mt-2">
              Tous vos autres appareils seront déconnectés automatiquement.
            </Form.Text>
            <Button type="submit" variant="warning" size="sm" className="mt-3" disabled={savingMdp}>
              {savingMdp ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-key me-1" />Changer le mot de passe</>}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}
