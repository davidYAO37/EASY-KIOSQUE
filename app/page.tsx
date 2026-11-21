'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ORANGE = 'var(--ek-green)';
const MARINE = '#14213d';

const POINTS_HERO = [
  'Ventes au comptant et à crédit',
  'Point journalier et hebdomadaire',
  'Notifications en temps réel',
  'Multi-kiosques et multi-utilisateurs',
];

const BANDEAU = [
  { icon: 'bi-bag', texte: 'Ventes rapides et sécurisées' },
  { icon: 'bi-bar-chart-line', texte: 'Suivi des recettes et dépenses' },
  { icon: 'bi-stack', texte: 'Point journalier et hebdomadaire' },
  { icon: 'bi-bell', texte: 'Notifications à chaque vente' },
  { icon: 'bi-people', texte: 'Multi-kiosques et multi-vendeurs' },
];

const AVANTAGES = [
  { icon: 'bi-lightning-charge', titre: 'Simple et rapide', texte: 'Une prise en main facile pour vos vendeurs.' },
  { icon: 'bi-shield-check', titre: 'Données sécurisées', texte: 'Aucune vente validée ne peut être modifiée ou supprimée.' },
  { icon: 'bi-eye', titre: 'Contrôle en temps réel', texte: 'Suivez vos ventes où que vous soyez.' },
  { icon: 'bi-layers', titre: 'Évolutif', texte: 'Ajoutez des kiosques, des vendeurs et des produits à tout moment.' },
];

const FONCTIONNALITES = [
  { icon: 'bi-cart3', titre: 'Caisse au prix officiel', texte: "Encaissez en quelques clics. Le prix est imposé par le serveur : le vendeur ne peut ni le modifier ni faire de remise. Espèces, Wave, Orange Money, MTN MoMo." },
  { icon: 'bi-shop', titre: 'Multi-kiosques', texte: 'Chaque point de vente a ses employés, sa caisse et ses chiffres — comparés en temps réel.' },
  { icon: 'bi-cash-stack', titre: 'Caisses et remises', texte: "Fond de caisse, point journalier à l'aveugle, clôture par le propriétaire, remises d'argent déclarées puis confirmées." },
  { icon: 'bi-credit-card', titre: 'Crédits clients', texte: 'Ventes à crédit plafonnées, remboursements avec reçus imprimables (thermique ou A4).' },
  { icon: 'bi-receipt', titre: 'Dépenses et rapports', texte: 'Dépenses par catégorie, rapports par kiosque, vendeur et période, exports Excel.' },
  { icon: 'bi-wifi-off', titre: 'Mode hors-ligne', texte: 'Coupure réseau ? La caisse continue. Les ventes se synchronisent au retour de la connexion.' },
];

// Repli si l'API des plans est injoignable — la vraie source est
// /api/plans (saisie super-admin).
const TARIFS_DEFAUT = [
  { nom: 'Essai gratuit', prix: '0 FCFA', periode: '· 15 j', details: ['1 kiosque', '1 utilisateur', 'Tous les modules'], vedette: false, aPartirDe: false },
  { nom: 'Kiosque', prix: '25 000 FCFA', periode: '/ mois', details: ['Jusqu’à 3 kiosques', '10 utilisateurs', 'Rapports & exports'], vedette: true, aPartirDe: true },
  { nom: 'Entreprise', prix: '50 000 FCFA', periode: '/ mois', details: ['Kiosques illimités', 'Utilisateurs illimités', 'Support prioritaire'], vedette: false, aPartirDe: true },
];

interface PlanPublic {
  code: string;
  nom: string;
  prixMensuel: number;
  dureeEssaiJours?: number;
  maxKiosques: number;
  maxUtilisateurs: number;
  description?: string;
  vedette?: boolean;
}

interface Tarif {
  nom: string;
  prix: string;
  periode: string;
  details: string[];
  vedette: boolean;
  aPartirDe: boolean;
}

function planVersTarif(p: PlanPublic): Tarif {
  // Les puces = description saisie par le super-admin (séparée par , ; ou retour
  // à la ligne) ; sinon les limites kiosques/utilisateurs du plan.
  const puces = (p.description || '').split(/[,;\n]+/).map((d) => d.trim()).filter(Boolean);
  const details = puces.length > 0 ? puces : [
    p.maxKiosques === 0 ? 'Kiosques illimités' : `Jusqu’à ${p.maxKiosques} kiosque${p.maxKiosques > 1 ? 's' : ''}`,
    p.maxUtilisateurs === 0 ? 'Utilisateurs illimités' : `${p.maxUtilisateurs} utilisateur${p.maxUtilisateurs > 1 ? 's' : ''}`,
  ];
  const gratuit = p.prixMensuel === 0;
  return {
    nom: p.nom,
    prix: `${p.prixMensuel.toLocaleString('fr-FR')} FCFA`,
    periode: gratuit ? (p.dureeEssaiJours ? `· ${p.dureeEssaiJours} j` : 'gratuit') : '/ mois',
    details,
    vedette: Boolean(p.vedette),
    aPartirDe: !gratuit,
  };
}

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
const CONTACT_TEL = process.env.NEXT_PUBLIC_CONTACT_TEL;

function Pastille({ icon, taille = 44 }: { icon: string; taille?: number }) {
  return (
    <span className="d-inline-flex align-items-center justify-content-center rounded-3 flex-shrink-0"
      style={{ width: taille, height: taille, background: 'var(--ek-green-light)', color: ORANGE }}>
      <i className={`bi ${icon} fs-5`}></i>
    </span>
  );
}

/**
 * Page d'accueil publique (vitrine) : en-tête, héro avec photo, bandeau
 * d'atouts, avantages, fonctionnalités, tarifs, contact, pied de page.
 */
export default function Home() {
  const router = useRouter();
  const [tarifs, setTarifs] = useState<Tarif[]>(TARIFS_DEFAUT);

  // Tarifs synchronisés avec les plans saisis par le super-admin
  useEffect(() => {
    fetch('/api/plans')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data?.plans) && data.plans.length > 0) {
          const liste = data.plans.map(planVersTarif);
          // Aucun plan coché « vedette » : on met en avant le premier plan payant
          if (!liste.some((t: Tarif) => t.vedette)) {
            const payant = liste.find((t: Tarif) => t.prix !== '0 FCFA');
            if (payant) payant.vedette = true;
          }
          setTarifs(liste);
        }
      })
      .catch(() => {});
  }, []);

  // Un utilisateur déjà connecté est redirigé vers son espace
  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then((res) => { if (res.ok) router.replace('/dashboard'); })
      .catch(() => {});
  }, [router]);

  return (
    <div className="ek-home" style={{ margin: '-1rem', background: '#fff', color: MARINE }}>
      {/* En-tête */}
      <nav className="navbar navbar-expand-lg bg-white sticky-top border-bottom shadow-sm">
        <div className="container">
          <a href="#accueil" className="navbar-brand d-flex align-items-center gap-2 fw-bold fs-4 m-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={44} height={44} />
            <span style={{ color: MARINE }}>EASY-<span style={{ color: ORANGE }}>KIOSQUE</span></span>
          </a>
          <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#ekNav"
            aria-controls="ekNav" aria-expanded="false" aria-label="Menu">
            <span className="navbar-toggler-icon"></span>
          </button>
          <div className="collapse navbar-collapse" id="ekNav">
            <ul className="navbar-nav mx-auto gap-lg-3 fw-medium">
              <li className="nav-item"><a className="nav-link ek-nav-actif" href="#accueil">Accueil</a></li>
              <li className="nav-item"><a className="nav-link" href="#fonctionnalites">Fonctionnalités</a></li>
              <li className="nav-item"><a className="nav-link" href="#avantages">Avantages</a></li>
              <li className="nav-item"><a className="nav-link" href="#tarifs">Tarifs</a></li>
              <li className="nav-item"><a className="nav-link" href="#contact">Contact</a></li>
            </ul>
            <div className="d-flex gap-2 py-2 py-lg-0">
              <Link href="/connexion" className="btn btn-outline-dark fw-medium">
                <i className="bi bi-person me-1"></i>Se connecter
              </Link>
              <Link href="/inscription" className="btn btn-primary fw-medium">Essayer gratuitement</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Héro */}
      <section id="accueil" className="position-relative overflow-hidden"
        style={{ background: 'linear-gradient(90deg,#fff7ed 0%,#ffffff 45%)' }}>
        <div className="container py-5">
          <div className="row align-items-center g-4">
            <div className="col-lg-6">
              <span className="badge rounded-pill px-3 py-2 fw-medium mb-3"
                style={{ background: 'var(--ek-green-light)', color: 'var(--ek-green-dark)' }}>
                Gestion de kiosques et de restauration
              </span>
              <h1 className="fw-bold lh-sm mb-3" style={{ fontSize: 'clamp(2.1rem,4vw,3.1rem)' }}>
                Pilotez vos kiosques en toute <span style={{ color: ORANGE }}>simplicité</span>
              </h1>
              <p className="fs-5 mb-4" style={{ color: '#334155' }}>
                La solution digitale pour enregistrer vos ventes, suivre vos dépenses,
                contrôler vos remises et consulter vos résultats en temps réel.
              </p>
              <ul className="list-unstyled mb-4">
                {POINTS_HERO.map((p) => (
                  <li key={p} className="d-flex align-items-center gap-2 mb-2">
                    <i className="bi bi-check-circle-fill fs-5" style={{ color: ORANGE }}></i>{p}
                  </li>
                ))}
              </ul>
              <div className="d-flex gap-3 flex-wrap">
                <Link href="/inscription" className="btn btn-primary px-4 py-2 fw-medium">
                  Démarrer maintenant <i className="bi bi-arrow-right ms-1"></i>
                </Link>
                <a href="#fonctionnalites" className="btn btn-outline-dark px-4 py-2 fw-medium">
                  <i className="bi bi-play-circle me-1"></i>Voir la démo
                </a>
              </div>
            </div>
            <div className="col-lg-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/hero-kiosque.jpg"
                alt="Vendeuse EASY-KIOSQUE utilisant l'application sur tablette, ordinateur et téléphone"
                className="w-100 d-block rounded-4"
                style={{ WebkitMaskImage: 'linear-gradient(90deg,transparent 0,#000 10%)', maskImage: 'linear-gradient(90deg,transparent 0,#000 10%)' }} />
            </div>
          </div>
        </div>

        {/* Bandeau d'atouts */}
        <div className="container pb-5">
          <div className="row g-3 row-cols-2 row-cols-md-3 row-cols-lg-5">
            {BANDEAU.map((b) => (
              <div key={b.texte} className="col">
                <div className="h-100 d-flex align-items-center gap-3 bg-white rounded-3 border p-3 shadow-sm">
                  <i className={`bi ${b.icon} fs-3`} style={{ color: ORANGE }}></i>
                  <span className="small fw-medium">{b.texte}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pourquoi choisir */}
      <section id="avantages" className="py-5 overflow-hidden">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-8">
              <h2 className="fw-bold mb-1">Pourquoi choisir <span style={{ color: ORANGE }}>EASY-KIOSQUE</span> ?</h2>
              <p className="text-muted mb-4">Un outil simple, fiable et conçu pour les kiosques et petites restaurations.</p>
              <div className="row g-4">
                {AVANTAGES.map((a, i) => (
                  <div key={a.titre} className={`col-6 col-md-3 ${i > 0 ? 'border-start-md' : ''}`}>
                    <Pastille icon={a.icon} />
                    <h6 className="fw-bold mt-3 mb-1">{a.titre}</h6>
                    <p className="small text-muted mb-0">{a.texte}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="col-lg-4">
              <div className="position-relative">
                <div className="position-absolute rounded-5" style={{ inset: '-14px -40px -14px 18px', background: 'var(--ek-green-light)' }}></div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/plat-kiosque.jpg" alt="Plat de spaghetti servi en kiosque"
                  className="position-relative w-100 d-block rounded-5 shadow" loading="lazy" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="py-5" style={{ background: '#fff7ed' }}>
        <div className="container">
          <h2 className="text-center fw-bold mb-1">Tout pour tenir votre commerce</h2>
          <p className="text-center text-muted mb-5">Chaque franc compté, chaque opération tracée.</p>
          <div className="row g-4">
            {FONCTIONNALITES.map((f) => (
              <div key={f.titre} className="col-md-6 col-lg-4">
                <div className="card h-100 border-0 shadow-sm rounded-4">
                  <div className="card-body p-4">
                    <Pastille icon={f.icon} taille={48} />
                    <h5 className="fw-bold mt-3">{f.titre}</h5>
                    <p className="text-muted small mb-0">{f.texte}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="py-5">
        <div className="container">
          <h2 className="text-center fw-bold mb-1">Tarifs simples et transparents</h2>
          <p className="text-center text-muted mb-5">Commencez gratuitement, évoluez quand vous grandissez.</p>
          <div className="row g-4 justify-content-center pt-3">
            {tarifs.map((t) => (
              <div key={t.nom} className="col-md-4 col-lg-3">
                <div className={`card h-100 rounded-4 position-relative ${t.vedette ? 'border-primary border-2 shadow' : 'shadow-sm'}`}
                  style={{ marginTop: 14 }}>
                  {t.vedette && (
                    <span className="badge bg-primary position-absolute top-0 start-50 translate-middle px-3 py-2 rounded-pill">
                      Le plus populaire
                    </span>
                  )}
                  <div className="card-body p-4 d-flex flex-column">
                    <h5 className="fw-bold mt-2">{t.nom}</h5>
                    <div className="d-flex align-items-center justify-content-center gap-2 rounded-3 px-3 py-2 my-3 fw-bold"
                      style={{ border: '2px dashed rgba(234,88,12,.4)', background: 'var(--ek-green-light)', color: 'var(--ek-green-dark)' }}>
                      <i className="bi bi-gem" style={{ color: ORANGE }}></i>
                      <span className="d-flex flex-column">
                        <span className="fw-normal" style={{ fontSize: '0.65rem', letterSpacing: '0.06em', minHeight: '1rem' }}>
                          {t.aPartirDe ? 'À PARTIR DE' : ' '}
                        </span>
                        <span>{t.prix} <span className="fw-normal small">{t.periode}</span></span>
                      </span>
                    </div>
                    <ul className="list-unstyled small flex-grow-1 mb-0">
                      {t.details.map((d) => (
                        <li key={d} className="d-flex align-items-center gap-2 mb-2">
                          <i className="bi bi-check-square-fill" style={{ color: ORANGE }}></i><span className="text-muted">{d}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/inscription" className={`btn mt-3 ${t.vedette ? 'btn-primary' : 'btn-outline-primary'}`}>
                      Choisir <i className="bi bi-arrow-right ms-1"></i>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center small text-muted mt-4">Paiement par Wave, Orange Money ou MTN MoMo.</p>
        </div>
      </section>

      {/* Contact / appel à l'action */}
      <section id="contact" className="py-5 text-white" style={{ background: `linear-gradient(135deg, var(--ek-green) 0%, var(--ek-green-dark) 100%)` }}>
        <div className="container text-center">
          <h2 className="fw-bold">Prêt à reprendre le contrôle de vos kiosques ?</h2>
          <p className="opacity-75 mb-4">30 jours d’essai gratuit. Vos données restent les vôtres.</p>
          <Link href="/inscription" className="btn btn-light btn-lg fw-semibold px-5" style={{ color: 'var(--ek-green-dark)' }}>
            Créer mon entreprise gratuitement
          </Link>
          {(CONTACT_EMAIL || CONTACT_TEL) && (
            <div className="d-flex justify-content-center gap-4 mt-4 flex-wrap">
              {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`} className="text-white text-decoration-none"><i className="bi bi-envelope me-2"></i>{CONTACT_EMAIL}</a>}
              {CONTACT_TEL && <a href={`tel:${CONTACT_TEL}`} className="text-white text-decoration-none"><i className="bi bi-telephone me-2"></i>{CONTACT_TEL}</a>}
            </div>
          )}
        </div>
      </section>

      {/* Pied de page */}
      <footer className="py-4 text-white-50" style={{ background: MARINE }}>
        <div className="container d-flex flex-column flex-md-row justify-content-between align-items-center gap-2">
          <span className="d-inline-flex align-items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={26} height={26} />
            EASY-KIOSQUE © {new Date().getFullYear()}
          </span>
          <div className="d-flex gap-3 small">
            <Link href="/cgu" className="text-white-50 text-decoration-none">Conditions d&apos;utilisation</Link>
            <Link href="/confidentialite" className="text-white-50 text-decoration-none">Confidentialité</Link>
            <Link href="/connexion" className="text-white-50 text-decoration-none">Connexion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
