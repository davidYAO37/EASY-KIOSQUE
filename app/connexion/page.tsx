'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Form, Button, Card } from 'react-bootstrap';
import axios from 'axios';
import { useAuthUser } from '@/hooks/useAuthUser';
import { ROLE_HOME, SERVICE_HOME } from '@/lib/permissions';

export default function ConnexionPage() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'warning' | 'danger' | 'info'>('info');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const router = useRouter();
  const { actualiser, effacer } = useAuthUser();

  const handleConnexion = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setIsLocked(false);
    setRemainingAttempts(null);

    try {
      const res = await axios.post('/api/login', {
        email: email,
        password: motDePasse,
      }, { withCredentials: true });

      if (!res.data || !res.data.user) {
        setMessage('Identifiant ou mot de passe incorrect');
        setMessageType('danger');
        setLoading(false);
        return;
      }

      const profil = res.data.user;

      if (profil) {
        localStorage.setItem('profil', JSON.stringify(profil));
        const nomComplet = `${profil.nom || ''} ${profil.prenom || ''}`.trim();
        localStorage.setItem('nom_utilisateur', nomComplet);

        setMessage('✅ Connexion réussie ! Redirection...');
        setMessageType('success');

        effacer();
        await actualiser();
        {
          const home = ROLE_HOME[profil?.type];
          if (home) {
            router.push(home);
          } else {
            const firstService = profil?.permissions?.services?.[0];
            router.push((firstService && SERVICE_HOME[firstService]) || '/dashboard');
          }
        }
      } else {
        setMessage('Erreur lors de la récupération du profil');
        setMessageType('danger');
      }
    } catch (error: any) {
      if (error.response?.status === 423) {
        setIsLocked(true);
        setMessage(error.response.data?.message || "Compte bloqué. Contactez l'administrateur.");
        setMessageType('danger');
      } else if (error.response?.status === 402) {
        setIsLocked(true);
        setMessage(error.response.data?.message || 'Compte entreprise suspendu.');
        setMessageType('danger');
      } else if (error.response?.status === 401) {
        const responseData = error.response.data;
        if (responseData?.remainingAttempts !== undefined) {
          setRemainingAttempts(responseData.remainingAttempts);
          setMessage(responseData.message || 'Identifiant ou mot de passe incorrect');
          setMessageType('warning');
        } else {
          setMessage('Identifiant ou mot de passe incorrect');
          setMessageType('danger');
        }
      } else if (error.response?.status === 400) {
        setMessage(error.response?.data?.message || 'Identifiant et mot de passe requis');
        setMessageType('danger');
      } else {
        console.error(error);
        setMessage('Erreur de connexion');
        setMessageType('danger');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ margin: '-1rem', background: '#f8fafc', minHeight: '100vh' }}
    >
      <section className="container py-5 d-flex justify-content-center">
        <div style={{ width: '100%', maxWidth: 480 }}>
            <Card className="shadow border-0 rounded-4">
              <Card.Body className="p-4">
                <h4 className="fw-bold mb-1">Connexion à votre espace</h4>
                <p className="small text-muted mb-4">Gestion commerciale multi-kiosques</p>

                {message && (
                  <div className={`alert alert-${messageType} d-flex align-items-center mb-4`}>
                    {messageType === 'success' && <i className="bi bi-check-circle-fill me-2"></i>}
                    {messageType === 'warning' && <i className="bi bi-exclamation-triangle-fill me-2"></i>}
                    {messageType === 'danger' && <i className="bi bi-x-circle-fill me-2"></i>}
                    {messageType === 'info' && <i className="bi bi-info-circle-fill me-2"></i>}
                    <div>
                      {message}
                      {remainingAttempts !== null && remainingAttempts > 0 && (
                        <div className="small mt-1">
                          <strong>Tentatives restantes: {remainingAttempts}/4</strong>
                        </div>
                      )}
                      {remainingAttempts !== null && remainingAttempts === 0 && (
                        <div className="small mt-1">
                          <strong>Plus de tentatives disponibles</strong>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {isLocked && (
                  <div className="alert alert-danger d-flex align-items-center mb-4">
                    <i className="bi bi-lock-fill me-2"></i>
                    <div>
                      <strong>Accès bloqué</strong>
                      <div className="small">
                        Veuillez contacter votre administrateur ou la plateforme EASY-KIOSQUE.
                      </div>
                    </div>
                  </div>
                )}

                <Form onSubmit={handleConnexion}>
                  <Form.Group className="mb-3">
                    <Form.Label>Identifiant (email)</Form.Label>
                    <Form.Control
                      aria-label="Email" type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </Form.Group>
                  <Form.Group className="mb-4">
                    <Form.Label>Mot de passe</Form.Label>
                    <Form.Control
                      aria-label="Mot de passe" type="password"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      required
                    />
                  </Form.Group>
                  <Button variant="primary" type="submit" className="w-100 fw-semibold py-2" disabled={loading || isLocked}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Connexion...
                      </>
                    ) : isLocked ? (
                      <>
                        <i className="bi bi-lock-fill me-2"></i>
                        Accès bloqué
                      </>
                    ) : (
                      <><i className="bi bi-box-arrow-in-right me-1"></i>Se connecter</>
                    )}
                  </Button>
                  <p className="text-center small text-muted mt-3 mb-2">
                    <i className="bi bi-lock me-1"></i>Connexion chiffrée — session sécurisée.
                  </p>
                  <div className="text-center">
                    <small className="text-muted d-block mb-1">
                      <Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
                    </small>
                    <small className="text-muted d-block mb-1">
                      Pas encore de compte ?{' '}
                      <Link href="/inscription">Créer mon entreprise</Link>
                    </small>
                    <small className="text-muted">
                      <Link href="/">← Retour à l&apos;accueil</Link>
                    </small>
                  </div>
                </Form>
              </Card.Body>
            </Card>
        </div>
      </section>
    </div>
  );
}
