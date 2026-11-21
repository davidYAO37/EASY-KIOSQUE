export const metadata = { title: 'Conditions d\'utilisation — EASY-KIOSQUE' };

/**
 * Conditions Générales d'Utilisation — contenu légal cadre pour le SaaS.
 * À faire valider par un juriste avant ouverture commerciale.
 */
export default function PageCGU() {
  return (
    <div className="container py-5" style={{ maxWidth: 800 }}>
      <h1 className="fw-bold mb-4">Conditions Générales d'Utilisation</h1>
      <p className="text-muted small">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>

      <h2 className="h5 fw-semibold mt-4">1. Objet</h2>
      <p>
        EASY-KIOSQUE est une application en ligne (SaaS) de gestion commerciale et financière
        destinée aux exploitants de kiosques, cafétérias et commerces : ventes, caisses,
        crédits clients, dépenses, employés et rapports. L'accès au service est fourni
        dans le cadre d'un abonnement ou d'une période d'essai.
      </p>

      <h2 className="h5 fw-semibold mt-4">2. Compte et responsabilités</h2>
      <ul>
        <li>Chaque entreprise dispose d'un espace isolé ; le propriétaire est responsable des comptes employés qu'il crée et des permissions qu'il leur accorde.</li>
        <li>Les identifiants sont personnels et confidentiels. Toute opération effectuée depuis un compte est réputée émaner de son titulaire.</li>
        <li>L'utilisateur s'engage à fournir des informations exactes et à ne pas utiliser le service à des fins illicites.</li>
      </ul>

      <h2 className="h5 fw-semibold mt-4">3. Abonnement et paiement</h2>
      <ul>
        <li>Une période d'essai gratuit de 30 jours est offerte à toute nouvelle entreprise.</li>
        <li>À l'issue de l'essai, l'accès aux fonctionnalités est conditionné au règlement de l'abonnement choisi (Wave, Orange Money, MTN MoMo ou virement).</li>
        <li>L'abonnement est payable d'avance, non remboursable, et renouvelable par période mensuelle ou annuelle.</li>
        <li>La plateforme peut suspendre l'accès en cas de non-paiement, avec un préavis affiché dans l'application.</li>
      </ul>

      <h2 className="h5 fw-semibold mt-4">4. Données</h2>
      <ul>
        <li>Les données saisies (ventes, clients, produits, caisses) restent la propriété de l'entreprise utilisatrice.</li>
        <li>Les opérations financières validées sont conservées de façon inaltérable : toute correction passe par une annulation tracée — c'est une garantie d'intégrité, pas un défaut.</li>
        <li>En fin d'abonnement, les données peuvent être exportées sur demande avant suppression.</li>
      </ul>

      <h2 className="h5 fw-semibold mt-4">5. Disponibilité et garanties</h2>
      <p>
        Le service est fourni « en l'état » avec un objectif de haute disponibilité, sans
        garantie d'accessibilité ininterrompue. La plateforme ne saurait être tenue
        responsable des pertes indirectes (manque à gagner, coupures réseau ou
        électriques, mauvaise utilisation du service).
      </p>

      <h2 className="h5 fw-semibold mt-4">6. Résiliation</h2>
      <p>
        L'utilisateur peut cesser son abonnement à tout moment ; la plateforme peut
        suspendre un compte en cas de violation des présentes conditions ou d'usage
        frauduleux, après notification.
      </p>

      <h2 className="h5 fw-semibold mt-4">7. Droit applicable</h2>
      <p>
        Les présentes conditions sont régies par le droit ivoirien. Tout litige sera
        soumis aux juridictions compétentes d'Abidjan, Côte d'Ivoire.
      </p>

      <hr className="my-4" />
      <p className="small text-muted">
        <a href="/">← Retour à l'accueil</a> · <a href="/confidentialite">Politique de confidentialité</a>
      </p>
    </div>
  );
}
