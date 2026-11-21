'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Container, Form, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

/**
 * Inscription SaaS : le propriétaire crée son entreprise et son compte
 * administrateur. Connexion automatique après création.
 */
export default function InscriptionPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nomSociete: '',
    nomCommercial: '',
    telephone: '',
    ville: '',
    nom: '',
    prenom: '',
    email: '',
    password: '',
    password2: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'danger'>('danger');

  const set = (k: keyof typeof form) => (e: any) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (form.password !== form.password2) {
      setMessage('Les deux mots de passe ne correspondent pas.');
      setMessageType('danger');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/inscription', {
        entreprise: {
          nomSociete: form.nomSociete,
          nomCommercial: form.nomCommercial,
          telephone: form.telephone,
          ville: form.ville,
        },
        admin: {
          nom: form.nom,
          prenom: form.prenom,
          email: form.email,
          password: form.password,
        },
      });

      // Connexion automatique après création du compte
      await axios.post('/api/login', {
        email: form.email,
        password: form.password,
      }, { withCredentials: true });

      setMessage('✅ Entreprise créée ! Redirection vers votre espace...');
      setMessageType('success');
      setTimeout(() => router.push('/dashboard'), 1200);
    } catch (error: any) {
      const msg = error.response?.data?.message;
      setMessage(msg || "Erreur lors de la création du compte.");
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container fluid className="min-vh-100 d-flex justify-content-center align-items-center login-background py-4">
      <Row className="w-100 justify-content-center">
        <Col md={8} lg={6} xl={5}>
          <Card className="p-4 shadow-lg border-0 login-card">
            <Card.Body>
              <div className="text-center mb-2">
                <span className="login-logo-tile">
                  <span className="ek-logo">
                    <img src="/logo.svg" alt="" width={42} height={42} className="rounded-3" />
                    <span className="ek-logo-text">EASY-<strong>KIOSQUE</strong></span>
                  </span>
                </span>
              </div>
              <p className="text-center text-muted mb-4">
                <small style={{ letterSpacing: "0.06em" }}>CRÉER MON ENTREPRISE</small><br />
                Votre espace de gestion en quelques minutes
              </p>

              {message && (
                <div className={`alert alert-${messageType} d-flex align-items-center mb-4`}>
                  <i className={`bi ${messageType === 'success' ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} me-2`}></i>
                  <div>{message}</div>
                </div>
              )}

              <Form onSubmit={handleSubmit}>
                <h6 className="text-uppercase text-muted mb-3" style={{ fontSize: '0.75rem', letterSpacing: '0.08em' }}>
                  Votre entreprise
                </h6>
                <Form.Group className="mb-3">
                  <Form.Label>Raison sociale ou nom du propriétaire *</Form.Label>
                  <Form.Control value={form.nomSociete} onChange={set('nomSociete')} required />
                </Form.Group>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Nom commercial</Form.Label>
                      <Form.Control value={form.nomCommercial} onChange={set('nomCommercial')} />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Téléphone</Form.Label>
                      <Form.Control value={form.telephone} onChange={set('telephone')} />
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-4">
                  <Form.Label>Ville</Form.Label>
                  <Form.Control value={form.ville} onChange={set('ville')} placeholder="Abidjan, Bouaké..." />
                </Form.Group>

                <h6 className="text-uppercase text-muted mb-3" style={{ fontSize: '0.75rem', letterSpacing: '0.08em' }}>
                  Votre compte administrateur
                </h6>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Nom *</Form.Label>
                      <Form.Control value={form.nom} onChange={set('nom')} required />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Prénoms</Form.Label>
                      <Form.Control value={form.prenom} onChange={set('prenom')} />
                    </Form.Group>
                  </Col>
                </Row>
                <Form.Group className="mb-3">
                  <Form.Label>Email (identifiant de connexion) *</Form.Label>
                  <Form.Control type="email" value={form.email} onChange={set('email')} required />
                </Form.Group>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Mot de passe *</Form.Label>
                      <Form.Control type="password" value={form.password} onChange={set('password')} minLength={6} required />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-4">
                      <Form.Label>Confirmer *</Form.Label>
                      <Form.Control type="password" value={form.password2} onChange={set('password2')} minLength={6} required />
                    </Form.Group>
                  </Col>
                </Row>

                <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Création en cours...
                    </>
                  ) : (
                    'Créer mon entreprise'
                  )}
                </Button>
                <div className="text-center mt-3">
                  <small className="text-muted d-block mb-1">
                    Déjà inscrit ? <Link href="/connexion">Se connecter</Link>
                  </small>
                  <small className="text-muted">
                    <Link href="/">← Retour à l&apos;accueil</Link>
                  </small>
                </div>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
