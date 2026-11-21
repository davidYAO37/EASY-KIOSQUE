'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Container, Form, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

/**
 * « Mot de passe oublié » : saisie de l'email → envoi d'un lien de
 * réinitialisation (valable 1 h, usage unique). La réponse est
 * volontairement identique que le compte existe ou non.
 */
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState('');

  const envoyer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErreur('');
    try {
      await axios.post('/api/reset/demande', { email });
      setEnvoye(true);
    } catch (err: any) {
      setErreur(err?.response?.data?.message || 'Une erreur est survenue. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

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
                <small>MOT DE PASSE OUBLIÉ</small>
              </p>

              {envoye ? (
                <div className="alert alert-success">
                  <i className="bi bi-check-circle-fill me-2"></i>
                  Si un compte existe avec cet email, un lien de réinitialisation vient d&apos;être
                  envoyé. Vérifiez votre boîte de réception (et les spams). Le lien expire dans 1 heure.
                </div>
              ) : (
                <Form onSubmit={envoyer}>
                  <p className="small text-muted">
                    Saisissez l&apos;email de votre compte : nous vous enverrons un lien pour
                    choisir un nouveau mot de passe.
                  </p>
                  {erreur && <div className="alert alert-danger small">{erreur}</div>}
                  <Form.Group className="mb-4">
                    <Form.Label>Email du compte</Form.Label>
                    <Form.Control
                      type="email" value={email} required autoFocus
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Form.Group>
                  <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                    {loading ? (
                      <><span className="spinner-border spinner-border-sm me-2"></span>Envoi...</>
                    ) : (
                      'Envoyer le lien de réinitialisation'
                    )}
                  </Button>
                </Form>
              )}

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
