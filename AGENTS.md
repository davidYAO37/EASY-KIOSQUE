# Notes projet — EASY-KIOSQUE (SaaS multi-entreprises / multi-kiosques)

Stack identique à NOVASYS : Next.js 16 (App Router) / React 19 / MongoDB Atlas (base `bdd_easy_kiosque`) / JWT maison / React-Bootstrap / pdfkit. Ajouts : **Zod** (validation) et **React-Toastify** (notifications).

## Vérification

```powershell
node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit
$env:NODE_OPTIONS="--max-old-space-size=8192"; node ./node_modules/next/dist/bin/next build
node ./node_modules/next/dist/bin/next dev -H 0.0.0.0 -p 3002   # 3000 easy_medical, 3001 novasys
```

Compte plateforme (seed) : `superadmin@easy-kiosque.local` / `admin123`.

## Variables d'environnement

`MONGO_URI` (ou `MONGODB_URI`), `JWT_SECRET`, `COOKIE_SECURE=false` (HTTP local), `NEXT_PUBLIC_BASE_URL`. `LICENCE_SECRET` réservé pour la V2 (abonnements).

## Multi-tenant — règle absolue

- Chaque document métier porte `entrepriseId` ; ceux propres à un point de vente portent aussi `kiosqueId`.
- L'entreprise vient de la session (`User.entrepriseId` via JWT), **jamais** d'un id envoyé par le navigateur.
- Helpers dans `lib/tenant.ts` : `filtreTenant`, `verifierKiosque`/`exigerKiosque`, `kiosquesAutorises`.
- `kiosqueIds` vide sur un utilisateur = accès à tous les kiosques de l'entreprise ; liste non vide = restriction.
- `requireAuth(req, roles, { actions })` : rejette 401/403, **402 `ENTREPRISE_SUSPENDUE`** si le compte entreprise est suspendu ; routes plateforme (super-admin) → `{ plateforme: true }` (pas d'entreprise exigée).
- Sélecteur de kiosque : cookie/localStorage `ek_kiosque` (commodité côté client) — l'appartenance est re-vérifiée côté serveur.

## Rôles et permissions

- Rôles (`lib/permissions.ts`) : `adminsuper` (plateforme, jamais attribuable), `admin`, `gestionnaire`, `responsable`, `caissier`, `vendeur`, `comptable`.
- **`vendeur`** = exécution seule : vendre au tarif officiel, voir ses ventes du jour, point journalier, déclarer remise, dépenses si autorisé. Jamais : prix, produits, modif/annulation de vente, remise, clôture, rapports.
- Services = entrées du menu (`ROLE_SERVICES`) ; actions sensibles = `PERMISSION_ACTIONS` (`enregistrer_vente`, `vente_credit`, `annuler_vente`, `declarer_remise`, `confirmer_remise`, `cloturer_caisse`, `gestion_utilisateurs`…).
- Profils = modèles de droits par entreprise (`models/profil.ts`) : attribuer un profil impose `type` + `permissions` côté serveur.
- UI : `aAction(code)` dans `hooks/useAuthUser.ts`, `components/RoleGuard.tsx` (prop `strict` pour les pages plateforme), `components/PermissionsModal.tsx`.

## Conventions héritées de NOVASYS

- Connexion Mongo : `db/mongoConnect.ts` (cache global + seed au 1er démarrage, `lib/seedDefaultData.ts`).
- Auth : JWT cookie httpOnly `ek_token`, `lib/auth.ts` ; `tokenVersion` révoque les jetons au changement de mot de passe ; login limité (4 essais/compte + 30/min/IP).
- Numérotation : `lib/numero.ts` → compteurs atomiques `sequences` par (entrepriseId, kiosqueId, clé).
- Transactions : `lib/transaction.ts` → `avecTransaction(fn)` = transaction multi-documents sur Atlas/replica set, **repli séquentiel automatique sur MongoDB standalone local** (pas d'atomicité — dev only ; `session` peut être `undefined` dans `fn`).
- `mongoConnect` force `dbName: "bdd_easy_kiosque"` quel que soit le chemin de l'URI.
- Validation des bodies API : schémas Zod centralisés dans `lib/validations.ts`.
- Journalisation : `journalconnexions`, `journauxactivite`.
- Suppressions de données financières validées : annulation historisée, jamais de delete physique (kiosque → `statut: inactif`).
- Après un changement de schéma Mongoose, **redémarrer `next dev`** (modèle en cache).

## Phases (cahier des charges)

1. ✅ Init, MongoDB, auth, entreprises (inscription + admin plateforme), kiosques, utilisateurs, permissions.
2. ✅ Catégories + produits — `services/catalogue.service.ts` ; codes auto `CAT###`/`P####` (collection `sequences`) ; inscription = **6 catégories + 42 produits par défaut** (menu type kiosque/cafétéria ivoirienne : petit-déj, garba/alloco/attiéké/placali/choukouya, beignets, boissons, marchandises — prix indicatifs FCFA, `PRODUITS_DEFAUT` dans `app/api/inscription/route.ts`) ; prix par kiosque dans `Produit.prixKiosques` (`prixPourKiosque`) ; suppression = soft-delete (`statut: inactif`) ; import Excel `/api/produits/import` (upsert par code, colonnes Code|Désignation|Catégorie|Type|Prix achat|Prix vente|Description), export `/api/produits/export`. Pas de stock, prix d'achat indicatif seulement.
3. ✅ Clients + ventes POS + paiements + tickets — `services/ventes.service.ts` (transaction : vente+lignes+paiements+créance+mouvements caisse ; prix TOUJOURS re-lus serveur via `prixPourKiosque`, zéro remise V1, schéma Zod `.strict()` rejette tout champ tarifaire) ; idempotence par `idempotencyKey` unique par entreprise ; numérotation `VTE-{codeKiosque}-{année}-####` ; annulation motivée réservée `annuler_vente` (jamais vendeur) ; notification propriétaire créée APRÈS commit (`/api/notifications`, cloche Header, badge Sidebar) ; clients `services/clients.service.ts` codes `CL###`, plafond de crédit appliqué ; modifications tarifaires journalisées dans `journauxactivite` (`modification_tarifaire` avant/après) ; portée liste ventes : admin/gestionnaire/comptable → tout, responsable → ses kiosques, vendeur/caissier → ses ventes seulement.
4. ✅ Crédits clients : créances (`services/credits.service.ts`), remboursements `RMB-{codeKiosque}-{année}-####` (transaction : remboursement + maj créances + paiements `remboursement_creance` + mouvements caisse ; ventilation explicite ou FIFO ancienneté ; JAMAIS au-delà du solde ; idempotence `idempotencyKey` ; garde optimiste sur `solde` ; notification + journal) ; reçu imprimable `RecuRemboursement` ; réglage imprimante par défaut + format (`thermique80`/`a4`) dans `Entreprise.impression` (page Paramètres, appliqué aux tickets ET reçus).
5. ✅ Caisses — `services/caisses.service.ts` : **session ouverte obligatoire pour toute entrée/sortie de tiroir** (`CAISSE_FERMEE` 400 : vente, remboursement, dépense) ; sessions `CAI-{codeKiosque}-{année}-####` (une seule active par kiosque, index partiel), fond de caisse = mouvement d'entrée ; solde théorique = Σ mouvements `sessionCaisseId` (ventes/remboursements/annulations rattachés automatiquement) ; point journalier **déclaré au comptant par l'opérateur** (écart calculé serveur, JAMAIS affiché au vendeur — comptage à l'aveugle) → `en_cloture` ; rejet de point tracé (`points[]` conservés) ; clôture réservée `cloturer_caisse` ; remises `REM-####` déclarées (`declarer_remise`, ≤ disponible = solde − remises en attente, idempotence) → sortie de caisse comptabilisée à la CONFIRMATION (`confirmer_remise`) ; annulation motivée, rien de supprimé ; notifications type `caisse`.
6. ✅ Dépenses — `services/depenses.service.ts` : dépense `DEP-{codeKiosque}-{année}-####` = sortie réelle du tiroir (session de caisse **ouverte requise**, mouvement `depense` immédiat) ; catégories `CD###` (6 par défaut à l'inscription : Fournisseurs, Loyer, Salaires, Transport, Eau/Élec, Divers) ; vendeur exclu par défaut (`enregistrer_depense` accordé par le propriétaire via permissions personnalisées) ; portée : opérateur = ses dépenses seulement ; annulation réservée `annuler_depense` (motif obligatoire, dépense conservée, mouvement compensateur d'entrée `annulation_depense` sur la session active) ; idempotence `idempotencyKey` ; notification type `depense` + journal.
7. ✅ Tableau de bord + rapports + exports — `services/rapports.service.ts` : `/api/rapports/tableau-bord` (KPIs jour réels + série CA 7j + top produits + performance par kiosque ; vendeur/caissier = version limitée à ses ventes) ; rapports `consulter_rapports` : `ventes` (jour/kiosque/vendeur/top produits), `kiosques` (comparaison CA/encaissé/dépenses/net/écarts), `depenses` (catégorie/jour/kiosque), `credits` (dû par client/kiosque), `caisses` (sessions + écarts) ; export Excel `GET /api/rapports/export?type=` réservé `export_donnees` (xlsx, multi-feuilles). UI : `app/dashboard/page.tsx` (recharts) + `/dashboard/rapports` (5 onglets, filtres période, graphiques recharts).
8. ✅ Tests multi-tenants + sécurité + déploiement — `scripts/test_phase8.mjs` (47 assertions : isolation croisée tous modules, vendeur 403, Zod strict anti-injection, verrouillage 423, suspension 402, super-admin sans accès métier) ; `exigerKiosque` renvoie 404 `KIOSQUE_INVALIDE`.
9. ✅ Expérience SaaS — **mot de passe oublié** : `/api/reset/demande`+`confirmer`, jeton SHA-256 stocké haché (`models/tokenReset.ts`), 1 h, usage unique, emails via `lib/mail.ts` (SMTP `SMTP_HOST/PORT/USER/PASS/MAIL_FROM`, sinon logs console) ; **abonnements** : `models/plan.ts` (seed ESSAI/KIOSQUE/ENTREPRISE), essai auto à l'inscription + lazy pour les anciennes — **durée = `dureeEssaiJours` du plan ESSAI lu en base** (`dureeEssaiJours()` dans `lib/abonnement.ts`, repli 30 j ; 0 = pas d'essai), grâce 5 j puis 402 `ABONNEMENT_EXPIRE` dans `requireAuth`, limites `LIMITE_PLAN` sur POST kiosques/utilisateurs (`lib/abonnement.ts`), encaissements manuels `/api/admin/abonnements` (`models/paiementAbonnement.ts`, jamais de temps perdu : la période part de l'échéance en cours) ; **super-admin SaaS** : `/api/admin/stats` + `/api/admin/plans` + page `/dashboard/admin/entreprises` enrichie (KPIs, encaissement, détail tenant) ; **journal d'audit** `/api/journal` + `/dashboard/journal` (admin/gestionnaire/comptable) ; **Mon compte** `/dashboard/parametres/compte` (profil + changement mdp — `tokenVersion++` révoque les autres sessions) ; **landing + CGU/confidentialité** (`/`, `/cgu`, `/confidentialite` — pages publiques dans `verifconnecion.tsx`) ; **PWA + hors-ligne** : `manifest.json`, `sw.js` (cache statique, navigations network-first, jamais de cache `/api`), file ventes `lib/offlineQueue.ts` + `components/BandeauHorsLigne.tsx` — l'idempotence garantit zéro doublon à la synchro.

## Sécurité (rappels)

- En-têtes dans `next.config.ts` : `nosniff`, `SAMEORIGIN`, `Referrer-Policy`.
- Cookie `ek_token` : `httpOnly` + `sameSite: strict` + `secure` en production (sauf `COOKIE_SECURE=false` pour LAN HTTP).
- `JWT_SECRET` obligatoire au démarrage ; `tokenVersion` révoque les jetons.
- Login : 4 échecs → verrouillage 423 ; 30 tentatives/min/IP → 429.
- Entreprise suspendue → 402 `ENTREPRISE_SUSPENDUE` sur toutes les API métier.
- Aucune donnée financière validée n'est supprimée — corrections tracées uniquement.

## Déploiement

- `next.config.ts` → `output: "standalone"` : build autonome (`.next/standalone` + `.next/static`).
- Production = **MongoDB Atlas ou replica set** (transactions réelles) ; standalone accepté en dev via `avecTransaction`.
- Variables requises : `MONGO_URI`, `JWT_SECRET`, `NEXT_PUBLIC_BASE_URL` ; `COOKIE_SECURE=true` derrière HTTPS.
- Commandes : `npm run build` → `npm run start` (port 3002) ; seed super-admin `superadmin@easy-kiosque.local / admin123` au 1er démarrage — **changer ce mot de passe en production**.
- Suites de tests fonctionnels : `scripts/test_phase5.mjs`, `test_phase6.mjs`, `test_phase7.mjs`, `test_phase8.mjs` (serveur de dev requis sur :3002).

## PWA / service worker

- SW actif = `public/sw-pwa.js` (production uniquement, `components/ServiceWorkerRegister.tsx`) : cache-first seulement sur `/_next/static`, réseau d'abord pour le reste, `/api` jamais caché.
- `public/sw.js` = **kill-switch** (vide les caches, se désenregistre, recharge) pour les navigateurs ayant l'ancien SW cache-first — ne pas le réutiliser. Changer de stratégie de cache = incrémenter `CACHE` dans `sw-pwa.js`.
- File hors-ligne (`lib/offlineQueue.ts`) : la synchro envoie `horsLigne: true` + `miseEnFileLe`. Toute vente hors-ligne **rejetée** par le serveur est journalisée (`vente_hors_ligne_rejetee`) **et notifiée au propriétaire** (`app/api/ventes/route.ts` → `tracerRejetHorsLigne`) — elle reste aussi visible dans `ek_offline_rejets` sur l'appareil du vendeur.

Interdits V1 : gestion de stock, ingrédients, fiches techniques, bénéfice net réel.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
