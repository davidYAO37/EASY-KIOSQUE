'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Form, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';
import { ROLE_HOME, SERVICE_HOME } from '@/lib/permissions';

const ORANGE = 'var(--ek-green)';

const ATOUTS = [
  { icon: 'bi-speedometer2', titre: 'Votre commerce en un coup d’œil', texte: 'Tableau de bord du jour : ventes, encaissements, dépenses et écarts de caisse en temps réel.' },
  { icon: 'bi-shop', titre: 'Tous vos kiosques sous contrôle', texte: 'Chaque point de vente a ses employés, sa caisse et ses chiffres — comparés instantanément.' },
  { icon: 'bi-cash-stack', titre: 'Chaque franc est tracé', texte: 'Points de caisse à l’aveugle, remises confirmées, aucune vente validée ne peut disparaître.' },
  { icon: 'bi-wifi-off', titre: 'Même hors-ligne', texte: 'Vos vendeurs continuent de vendre sans réseau ; tout se synchronise au retour de la connexion.' },
];

const STATS = [
{ chiffre: '30 j', libelle: 'ESSAI GRATUIT' },
  { chiffre: '0 F', libelle: 'FRAIS CACHÉS' },
  { chiffre: '7/7', libelle: 'ACCÈS EN LIGNE' },
  {chiffre: 'Gestion', libelle: 'MULTI-KIOSQUES'},
];

const GARANTIES = [
  { icon: 'bi-shield-lock', texte: 'Session sécurisée — votre compte se verrouille après 4 essais ratés.' },
  { icon: 'bi-journal-check', texte: 'Chaque connexion et chaque opération sont journalisées.' },
  { icon: 'bi-download', texte: 'Vos données restent les vôtres — export Excel à tout moment.' },
];

export default function ConnexionPage() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'warning' | 'danger' | 'info'>('info');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const router = useRouter();

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

        setTimeout(() => {
          const home = ROLE_HOME[profil?.type];
          if (home) {
            router.push(home);
          } else {
            const firstService = profil?.permissions?.services?.[0];
            router.push((firstService && SERVICE_HOME[firstService]) || '/dashboard');
          }
        }, 1000);
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
    <div style={{ margin: '-1rem', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Bandeau d'accroche */}
      <section className="text-white text-center"
        style={{ background: 'linear-gradient(135deg, var(--ek-green-dark) 0%, var(--ek-green) 60%, #f59e0b 130%)' }}>
        <div className="container py-5">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <Link href="/" className="d-inline-flex align-items-center gap-2 text-white text-decoration-none fw-bold fs-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" width={40} height={40} />
              EASY-KIOSQUE
            </Link>
            <Link href="/inscription" className="btn btn-outline-light btn-sm fw-medium">
              <i className="bi bi-rocket-takeoff me-1"></i>Essayer gratuitement
            </Link>
          </div>
          <span className="badge rounded-pill px-3 py-2 fw-medium mb-3 bg-white" style={{ color: 'var(--ek-green-dark)' }}>
            ESPACE SÉCURISÉ
          </span>
          <h1 className="fw-bold mb-2" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            Bon retour <span style={{ color: '#ffd9b0' }}>parmi nous</span>
          </h1>
          <p className="opacity-75 mb-4">
            Vos ventes, vos caisses, vos rapports — en temps réel.
          </p>
          <Row className="justify-content-center g-3 mt-2">
            {STATS.map((s) => (
              <Col key={s.libelle} xs={6} md={3} lg={2}>
                <div className="fs-3 fw-bold" style={{ color: '#ffd9b0' }}>{s.chiffre}</div>
                <div className="small fw-medium opacity-75" style={{ fontSize: '0.7rem', letterSpacing: '0.08em' }}>{s.libelle}</div>
              </Col>
            ))}
          </Row>
        </div>
      </section>

      {/* Contenu : atouts + formulaire */}
      <section className="container py-5">
        <Row className="g-4">
          {/* Colonne gauche : présentation produit */}
          <Col lg={7}>
            <h2 className="fw-bold mb-1">Pilotez vos kiosques où que vous soyez</h2>
            <p className="text-muted mb-4">
              Connectez-vous pour reprendre le contrôle de votre commerce.
            </p>
            <div className="d-flex flex-column gap-3">
              {ATOUTS.map((a) => (
                <div key={a.titre} className="d-flex gap-3 bg-white rounded-3 shadow-sm p-3 border-start border-4"
                  style={{ borderColor: `${ORANGE} !important` }}>
                  <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
                    style={{ width: 44, height: 44, background: 'var(--ek-green-light)', color: ORANGE }}>
                    <i className={`bi ${a.icon} fs-5`}></i>
                  </span>
                  <div>
                    <div className="fw-bold">{a.titre}</div>
                    <div className="small text-muted">{a.texte}</div>
                  </div>
                </div>
              ))}
            </div>

            <h5 className="fw-bold mt-5 mb-3">Vos données sont en sécurité</h5>
            <div className="d-flex flex-column gap-2">
              {GARANTIES.map((g) => (
                <div key={g.texte} className="d-flex align-items-center gap-2 small text-muted">
                  <i className={`bi ${g.icon} fs-5`} style={{ color: ORANGE }}></i>{g.texte}
                </div>
              ))}
            </div>
          </Col>

          {/* Colonne droite : formulaire de connexion */}
          <Col lg={5}>
            <Card className="shadow border-0 rounded-4 sticky-top" style={{ top: '1rem' }}>
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
          </Col>
        </Row>
      </section>
    </div>
  );
}
