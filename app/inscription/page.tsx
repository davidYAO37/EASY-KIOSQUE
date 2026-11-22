'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Form, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';
import { useAuthUser } from '@/hooks/useAuthUser';

const ORANGE = 'var(--ek-green)';

const ATOUTS = [
  { icon: 'bi-cart3', titre: 'Caisse au prix officiel', texte: 'Ventes au comptant et à crédit en quelques clics. Le prix est imposé par le serveur : le vendeur ne peut ni le modifier ni faire de remise.' },
  { icon: 'bi-shop', titre: 'Multi-kiosques', texte: 'Chaque point de vente a ses employés, sa caisse et ses chiffres — comparés en temps réel.' },
  { icon: 'bi-cash-stack', titre: 'Caisses et remises', texte: "Fond de caisse, point journalier à l'aveugle, remises d'argent déclarées puis confirmées par le propriétaire." },
  { icon: 'bi-credit-card', titre: 'Crédits clients', texte: 'Crédits plafonnés, remboursements tracés avec reçus imprimables (thermique ou A4).' },
  { icon: 'bi-wifi-off', titre: 'Mode hors-ligne', texte: 'Coupure réseau ? La caisse continue. Les ventes se synchronisent au retour de la connexion.' },
];

const STATS = [
  { chiffre: '30 j', libelle: 'ESSAI GRATUIT' },
  { chiffre: '0 F', libelle: 'FRAIS CACHÉS' },
  { chiffre: '7/7', libelle: 'ACCÈS EN LIGNE' },
  {chiffre: 'Gestion', libelle: 'MULTI-KIOSQUES'},
];

const GARANTIES = [
  { icon: 'bi-shield-lock', texte: 'Aucune vente validée ne peut être modifiée ou supprimée.' },
  { icon: 'bi-download', texte: 'Vos données restent les vôtres — export Excel à tout moment.' },
  { icon: 'bi-journal-check', texte: 'Chaque opération est horodatée et journalisée.' },
];

/**
 * Inscription SaaS : le propriétaire crée son entreprise et son compte
 * administrateur. Connexion automatique après création.
 */
export default function InscriptionPage() {
  const router = useRouter();
  const { actualiser, effacer } = useAuthUser();
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
      effacer();
      await actualiser();
      router.replace('/dashboard');
    } catch (error: any) {
      const msg = error.response?.data?.message;
      setMessage(msg || "Erreur lors de la création du compte.");
      setMessageType('danger');
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
            <Link href="/connexion" className="btn btn-outline-light btn-sm fw-medium">
              <i className="bi bi-person me-1"></i>Se connecter
            </Link>
          </div>
          <span className="badge rounded-pill px-3 py-2 fw-medium mb-3 bg-white" style={{ color: 'var(--ek-green-dark)' }}>
            ESSAI GRATUIT — SANS ENGAGEMENT
          </span>
          <h1 className="fw-bold mb-2" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>
            Créez votre espace <span style={{ color: '#ffd9b0' }}>en quelques minutes</span>
          </h1>
          <p className="opacity-75 mb-4">
            Caisse POS · Multi-kiosques · Crédits clients · Rapports · Mode hors-ligne<br />
            Vos vendeurs vendent, vous contrôlez tout.
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
            <h2 className="fw-bold mb-1">Une solution complète pour votre kiosque</h2>
            <p className="text-muted mb-4">
              Tout ce dont vous avez besoin pour gérer votre commerce, dans un seul système.
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

          {/* Colonne droite : formulaire d'inscription */}
          <Col lg={5}>
            <Card className="shadow border-0 rounded-4 sticky-top" style={{ top: '1rem' }}>
              <Card.Body className="p-4">
                <h4 className="fw-bold mb-1">Créez votre entreprise</h4>
                <p className="small text-muted mb-4">Essai gratuit — sans engagement — sans carte bancaire</p>

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
                        <Form.Control value={form.telephone} onChange={set('telephone')} placeholder="+225 07 XX XX XX XX" />
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

                  <Button variant="primary" type="submit" className="w-100 fw-semibold py-2" disabled={loading}>
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Création en cours...
                      </>
                    ) : (
                      <><i className="bi bi-rocket-takeoff me-1"></i>Créer mon entreprise gratuite</>
                    )}
                  </Button>
                  <p className="text-center small text-muted mt-3 mb-2">
                    <i className="bi bi-lock me-1"></i>Vos données sont confidentielles. Aucun spam.
                  </p>
                  <div className="text-center">
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
      </section>
    </div>
  );
}
