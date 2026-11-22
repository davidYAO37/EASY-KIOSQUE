import assert from 'node:assert/strict';

export default async function run(page, ui) {
  const origine = new URL(page.url()).origin;
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const requetes = [];
  const eid = '111111111111111111111111';
  const uid = '222222222222222222222222';
  const kid = '333333333333333333333333';
  const kid2 = '444444444444444444444444';
  const cid = '555555555555555555555555';
  const date = new Date().toISOString();
  let superadmin = false;
  let remboursements = 0;
  const user = () => ({ _id: uid, entrepriseId: superadmin ? null : eid, nom: 'Test', prenom: 'QA', email: 'qa@example.invalid', type: superadmin ? 'adminsuper' : 'admin', permissions: { actions: ['*'], services: ['*'] } });
  const entreprise = { _id: eid, nomSociete: 'Entreprise QA', devise: 'FCFA', statut: 'actif', abonnement: { planNom: 'Entreprise', planCode: 'ENTREPRISE', statut: 'actif', joursRestants: 60, expireLe: date } };
  const client = { _id: cid, code: 'CL001', nom: 'Client QA', prenoms: '', statut: 'actif', soldeDu: 1000, soldeCredit: 1000 };
  const produit = { _id: '666666666666666666666666', code: 'P0001', designation: 'Produit QA', prixVente: 500, statut: 'actif', typeProduit: 'REVENTE', prixKiosques: [] };
  const vide = { total: 0, page: 1, pages: 1, limit: 20 };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    requetes.push({ path, query: url.search, method: req.method() });
    const json = async (body, status = 200) => { try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }); } catch {} };
    if (path === '/api/me') return json({ user: user(), entreprise: superadmin ? null : entreprise });
    if (path === '/api/kiosques') return json({ kiosques: [{ _id: kid, code: 'K01', designation: 'Kiosque A', statut: 'actif' }, { _id: kid2, code: 'K02', designation: 'Kiosque B', statut: 'actif' }] });
    if (path === '/api/rapports/tableau-bord') return json({ controleur: true, jour: {}, serie7j: [], parKiosque: [], parMode: [], topProduits: [] });
    if (path === '/api/notifications') return json({ notifications: [], nonLues: 0 });
    if (path === '/api/rapports/ventes') return json({ totaux: { ca: 0, encaisse: 0, nbVentes: 0, panierMoyen: 0, caComptant: 0, caCredit: 0 }, parJour: [], parKiosque: [], parVendeur: [], parMode: [], topProduits: [] });
    if (path === '/api/produits') return json({ ...vide, total: 1, produits: [produit] });
    if (path === '/api/categories') return json({ categories: [{ _id: 'cat', code: 'CAT001', libelle: 'Catégorie QA', statut: 'actif', nbProduits: 1 }] });
    if (path === '/api/clients') {
      const q = url.searchParams.get('q');
      if (q === 'lent' || q === 'retard') await new Promise((r) => setTimeout(r, 900));
      return json({ ...vide, total: 1, clients: [{ ...client, nom: q ? `Client ${q}` : client.nom }] });
    }
    if (path === '/api/caisses/actuelle') return json({ session: null });
    if (path === '/api/caisses') return json({ ...vide, items: [] });
    if (path === '/api/remises') return json({ ...vide, items: [] });
    if (path === '/api/credits') return json({ ...vide, total: 1, totalDu: 1000, creances: [{ _id: 'creance', clientId: cid, client, venteId: 'vente', numeroVente: 'VTE-QA', kiosqueId: kid, dateVente: date, montantInitial: 1000, montantPaye: 0, solde: 1000, statut: 'non_paye' }] });
    if (path === '/api/remboursements' && req.method() === 'POST') { remboursements++; return json({ remboursement: { _id: 'rmb', numero: 'RMB-QA' } }); }
    if (path === '/api/remboursements/rmb/recu') return json({ message: 'Reçu temporairement indisponible' }, 503);
    if (path === '/api/remboursements') return json({ ...vide, remboursements: [] });
    if (path === '/api/depenses/categories') return json({ categories: [] });
    if (path === '/api/depenses') return json({ ...vide, items: [], totalValidees: 0 });
    if (path === '/api/ventes') return json({ ...vide, ventes: [] });
    if (path === '/api/utilisateurs') return json({ utilisateurs: [user()] });
    if (path === '/api/profils') return json({ profils: [] });
    if (path === '/api/journal') return json({ ...vide, entrees: [], modules: [] });
    if (path === '/api/entreprises/moi') return json({ entreprise });
    if (path === '/api/entreprises') return json({ entreprises: [] });
    if (path === '/api/admin/plans') return json({ plans: [] });
    if (path === '/api/admin/stats') return json({ entreprises: { total: 0, suspendues: 0, enEssai: 0, expirees: 0, expirant7j: 0, nouvelles30j: 0, parPlan: {} }, utilisateurs: 0, kiosques: 0, ventes: { total: 0, volume: 0 }, revenus: { mois: 0, total: 0 }, connexions7j: 0 });
    if (path === '/api/plans') return json({ plans: [] });
    return json({ message: `API non simulée : ${path}` }, 404);
  });
  const compter = (path) => requetes.filter((r) => r.path === path && r.method === 'GET').length;
  await page.goto(`${origine}/dashboard`);
  await page.getByRole('heading', { name: 'Tableau de bord', exact: true }).waitFor();
  assert.equal(compter('/api/me'), 1, 'une seule lecture de session au démarrage');
  assert.equal(compter('/api/kiosques'), 1, 'une seule lecture des kiosques partagés');
  assert.equal(compter('/api/rapports/tableau-bord'), 1, 'pas de double calcul initial');
  await ui.snapshot();
  await page.getByRole('combobox', { name: 'Kiosque actif' }).selectOption(kid2);
  await page.waitForFunction((id) => [...document.querySelectorAll('select')].every((s) => s.value === id), kid2);
  assert.equal(await page.locator('select').last().inputValue(), kid2, 'les deux sélecteurs sont synchronisés');
  const naviguer = async (chemin, titre) => {
    await ui.snapshot();
    await page.locator(`a[href="${chemin}"]`).first().click();
    await page.locator('h3,h4').filter({ hasText: titre }).waitFor();
    await page.waitForFunction(() => !document.querySelector('table[aria-busy="true"]'));
  };
  await naviguer('/dashboard/clients', 'Clients');
  const recherche = page.getByPlaceholder('Nom, code, téléphone…');
  await recherche.fill('lent');
  await page.waitForRequest((r) => r.url().includes('/api/clients?') && r.url().includes('q=lent'));
  await recherche.fill('rapide');
  await page.getByText('Client rapide', { exact: true }).waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await page.getByText('Client lent', { exact: true }).count(), 0, 'une ancienne réponse ne remplace pas le filtre actuel');
  await recherche.fill('retard');
  await page.waitForRequest((r) => r.url().includes('q=retard'));
  assert.ok(await page.getByText('Client rapide', { exact: true }).isVisible(), 'les données restent visibles pendant la relecture');
  await page.getByText('Client retard', { exact: true }).waitFor();
  const pages = [
    ['/dashboard/produits', 'Produits'], ['/dashboard/categories', 'Catégories'], ['/dashboard/kiosques', 'Mes kiosques'],
    ['/dashboard/utilisateurs', 'Utilisateurs'], ['/dashboard/profils', 'Profils de droits'], ['/dashboard/journal', "Journal d'activité"],
    ['/dashboard/notifications', 'Notifications'], ['/dashboard/depenses', 'Dépenses'], ['/dashboard/caisse', 'Gestion des caisses'],
    ['/dashboard/credits', 'Crédits clients'], ['/dashboard/rapports', 'Rapports'],
  ];
  for (const [chemin, titre] of pages) await naviguer(chemin, titre);
  await naviguer('/dashboard/ventes', 'Point de vente');
  await naviguer('/dashboard/ventes/historique', 'Historique des ventes');
  assert.equal(compter('/api/me'), 1, 'les navigations ne rechargent pas la session');
  for (const [chemin, titre] of [['/dashboard/parametres/compte', 'Mon compte'], ['/dashboard/parametres/entreprise', 'Paramètres — Entreprise']]) {
    await page.goto(`${origine}${chemin}`);
    await page.locator('h3,h4').filter({ hasText: titre }).waitFor();
  }
  await page.goto(`${origine}/dashboard/credits`);
  await page.getByRole('button', { name: /Encaisser/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /CL001.*Client QA/ }).click();
  await page.getByRole('dialog').getByText('VTE-QA', { exact: true }).waitFor();
  await ui.snapshot();
  const modal = page.getByRole('dialog');
  const nombre = modal.locator('input[type="number"]').first();
  await nombre.fill('500');
  await modal.getByRole('button', { name: /Encaisser/ }).click();
  await page.getByText(/Remboursement enregistré. Reçu indisponible/).waitFor();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('dialog').count(), 0, 'le formulaire est fermé même si le reçu échoue');
  assert.equal(remboursements, 1, 'un seul remboursement envoyé');
  superadmin = true;
  requetes.length = 0;
  await page.goto(`${origine}/dashboard/admin/entreprises`);
  await page.getByRole('heading', { name: 'Plateforme — Pilotage SaaS' }).waitFor();
  assert.equal(compter('/api/kiosques'), 0, 'aucun appel métier kiosque pour le super-admin');
  assert.equal(compter('/api/notifications'), 0, 'aucun appel métier notification pour le super-admin');
  assert.deepEqual(erreurs, [], 'aucune exception React');
  return { resultat: 'Chargements et isolation UI vérifiés avec API simulées', pages: pages.length + 7, remboursements, erreurs };
}
