'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Container, Form, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

/**
 * Réinitialisation du mot de passe via le jeton reçu par email
 * (/reinitialiser?token=...). Le jeton est à usage unique et expire
 * après 1 heure. Toutes les anciennes sessions sont révoquées.
 */
function FormulaireReset() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);

  const confirmer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nouveau !== confirmation) {
      setMessage('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await axios.post('/api/reset/confirmer', { token, nouveauMotDePasse: nouveau });
      setOk(true);
      setTimeout(() => router.push('/connexion'), 2500);
    } catch (err: any) {
      setMessage(err?.response?.data?.message || 'Lien invalide ou expiré.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="alert alert-danger">
        <i className="bi bi-x-circle-fill me-2"></i>
        Lien de réinitialisation incomplet. Refaites une{' '}
        <Link href="/mot-de-passe-oublie" className="alert-link">demande</Link>.
      </div>
    );
  }

  if (ok) {
    return (
      <div className="alert alert-success">
        <i className="bi bi-check-circle-fill me-2"></i>
        Mot de passe réinitialisé ! Redirection vers la connexion...
      </div>
    );
  }

  return (
    <Form onSubmit={confirmer}>
      {message && <div className="alert alert-danger small">{message}</div>}
      <Form.Group className="mb-3">
        <Form.Label>Nouveau mot de passe</Form.Label>
        <Form.Control
          type="password" value={nouveau} required minLength={6} autoFocus
          autoComplete="new-password" onChange={(e) => setNouveau(e.target.value)}
        />
      </Form.Group>
      <Form.Group className="mb-4">
        <Form.Label>Confirmation</Form.Label>
        <Form.Control
          type="password" value={confirmation} required minLength={6}
          autoComplete="new-password" onChange={(e) => setConfirmation(e.target.value)}
        />
      </Form.Group>
      <Button variant="primary" type="submit" className="w-100" disabled={loading}>
        {loading ? (
          <><span className="spinner-border spinner-border-sm me-2"></span>Validation...</>
        ) : (
          'Définir le nouveau mot de passe'
        )}
      </Button>
    </Form>
  );
}

export default function ReinitialiserPage() {
  return (
    <Container fluid className="vh-100 d-flex justify-content-center align-items-center login-background">
      <Row className="w-100">
        <Col md={{ span: 6, offset: 3 }} lg={{ span: 4, offset: 4 }}>
          <Card className="p-4 shadow-lg border-0 login-card">
            <Card.Body>
              <div className="text-center mb-2">
                <span className="login-logo-tile">
                  <span className="ek-logo">
                    <span className="ek-logo-badge"><i className="bi bi-shop"></i></span>
                    <span className="ek-logo-text">EASY-<strong>KIOSQUE</strong></span>
                  </span>
                </span>
              </div>
              <p className="text-center text-muted mb-4">
                <small>NOUVEAU MOT DE PASSE</small>
              </p>
              <Suspense fallback={<div className="text-center py-3"><span className="spinner-border" /></div>}>
                <FormulaireReset />
              </Suspense>
              <div className="text-center mt-3">
                <small className="text-muted">
                  <Link href="/connexion">← Retour à la connexion</Link>
                </small>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
