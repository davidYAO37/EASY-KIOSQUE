import Link from 'next/link';

export const metadata = { title: 'Politique de confidentialité — EASY-KIOSQUE' };

/**
 * Politique de confidentialité — cadre légal pour le SaaS (collecte,
 * usage, conservation, droits des utilisateurs).
 */
export default function PageConfidentialite() {
  return (
    <div className="container py-5" style={{ maxWidth: 800 }}>
      <h1 className="fw-bold mb-4">Politique de Confidentialité</h1>
      <p className="text-muted small">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}</p>

      <h2 className="h5 fw-semibold mt-4">1. Données collectées</h2>
      <ul>
        <li><b>Compte</b> : nom, prénom, email, mot de passe (stocké chiffré/haché), téléphone.</li>
        <li><b>Entreprise</b> : raison sociale, coordonnées, kiosques, employés et permissions.</li>
        <li><b>Exploitation</b> : produits, ventes, paiements, clients, crédits, caisses, dépenses — saisies par vos utilisateurs.</li>
        <li><b>Technique</b> : journaux de connexion (date, IP, navigateur) et journal d'activité à des fins de sécurité et d'audit.</li>
      </ul>

      <h2 className="h5 fw-semibold mt-4">2. Utilisation</h2>
      <p>
        Les données servent exclusivement à fournir le service : fonctionnement de
        l'application, authentification, sécurité, support et amélioration du produit.
        Nous ne vendons ni ne louons vos données à des tiers.
      </p>

      <h2 className="h5 fw-semibold mt-4">3. Isolation des données</h2>
      <p>
        Chaque entreprise accède uniquement à ses propres données (isolation
        multi-tenant vérifiée côté serveur). L'administrateur de la plateforme n'accède
        jamais au détail métier (ventes, clients) des entreprises abonnées — uniquement
        aux informations de compte nécessaires au support.
      </p>

      <h2 className="h5 fw-semibold mt-4">4. Conservation</h2>
      <ul>
        <li>Les données sont conservées pendant la durée de l'abonnement.</li>
        <li>Les opérations financières validées sont conservées de façon inaltérable (traçabilité légale et anti-fraude).</li>
        <li>Après résiliation, les données peuvent être exportées puis supprimées sous 90 jours sur demande.</li>
      </ul>

      <h2 className="h5 fw-semibold mt-4">5. Sécurité</h2>
      <p>
        Mots de passe hachés (bcrypt), sessions signées (JWT httpOnly), verrouillage
        après échecs de connexion, limitation des requêtes, accès cloisonné par rôle
        et permissions. Les mots de passe ne sont jamais accessibles en clair.
      </p>

      <h2 className="h5 fw-semibold mt-4">6. Vos droits</h2>
      <p>
        Vous pouvez demander l'accès, la rectification ou la suppression de vos données
        personnelles, ainsi que l'export des données de votre entreprise, en contactant
        le support EASY-KIOSQUE.
      </p>

      <h2 className="h5 fw-semibold mt-4">7. Cookies</h2>
      <p>
        Un unique cookie technique httpOnly assure la session de connexion. Aucun
        cookie publicitaire ni traceur tiers n'est utilisé.
      </p>

      <hr className="my-4" />
      <p className="small text-muted">
        <Link href="/">← Retour à l'accueil</Link> · <Link href="/cgu">Conditions d'utilisation</Link>
      </p>
    </div>
  );
}
