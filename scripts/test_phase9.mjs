/* PHASE 9 — Expérience SaaS : abonnements, reset mdp, compte, journal, admin */
const BASE = 'http://localhost:3002';
let ok = 0, ko = 0;
const t = (nom, cond, extra = '') => { if (cond) { ok++; console.log(`  ✓ ${nom}`); } else { ko++; console.log(`  ✗ ${nom} ${extra}`); } };

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `ek_token=${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const cookie = (res) => (res.headers.get('set-cookie') || '').match(/ek_token=([^;]+)/)?.[1];
async function login(email, password) {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  return { status: res.status, token: cookie(res), data: await res.json().catch(() => null) };
}

// Super-admin
const sa = await login('superadmin@easy-kiosque.local', 'admin123');
t('login super-admin', sa.status === 200);

// --- Admin plateforme enrichi ---
console.log('\n— Plateforme —');
const stats = await api('/api/admin/stats', { token: sa.token });
t('GET /api/admin/stats 200', stats.status === 200);
t('stats: plans seedés', (stats.data?.plans || []).length >= 3);
const plans = await api('/api/admin/plans', { token: sa.token });
t('GET /api/admin/plans', plans.status === 200 && plans.data.plans.length >= 3);

// Inscription d'une entreprise de test (essai 30j auto)
console.log('\n— Inscription + essai —');
const ins = await api('/api/inscription', { method: 'POST', body: {
  entreprise: { nomSociete: 'TEST P9 SARL', telephone: '0700000099', ville: 'Abidjan' },
  admin: { nom: 'P9', prenom: 'Admin', email: 'admin.p9@test.ci', password: 'test1234' },
  kiosque: { designation: 'Kiosque P9' },
}});
t('inscription 201', ins.status === 201, JSON.stringify(ins.data).slice(0, 200));
const adm = await login('admin.p9@test.ci', 'test1234');
t('login admin test', adm.status === 200);

const me = await api('/api/me', { token: adm.token });
t('/api/me expose abonnement ESSAI', me.data?.entreprise?.abonnement?.statut === 'essai', JSON.stringify(me.data?.entreprise?.abonnement));
t('essai ~30 jours', me.data?.entreprise?.abonnement?.joursRestants >= 29);

// Limites du plan ESSAI : 1 kiosque, 3 utilisateurs
// (l'inscription ne crée PAS de kiosque — le 1er POST est légitime)
console.log('\n— Limites plan —');
const k1 = await api('/api/kiosques', { method: 'POST', token: adm.token, body: { designation: 'K1' } });
t('1er kiosque autorisé', k1.status === 201, `${k1.status}`);
const k2 = await api('/api/kiosques', { method: 'POST', token: adm.token, body: { designation: 'K2' } });
t('2e kiosque refusé (LIMITE_PLAN)', k2.status === 403 && k2.data?.code === 'LIMITE_PLAN', `${k2.status}`);
const u2 = await api('/api/utilisateurs', { method: 'POST', token: adm.token, body: { nom: 'U2', prenom: 'T', email: 'u2.p9@test.ci', password: 'x12345', type: 'vendeur' } });
const u3 = await api('/api/utilisateurs', { method: 'POST', token: adm.token, body: { nom: 'U3', prenom: 'T', email: 'u3.p9@test.ci', password: 'x12345', type: 'caissier' } });
t('2 utilisateurs créés (<=3)', u2.status === 201 && u3.status === 201, `${u2.status}/${u3.status}`);
const u4 = await api('/api/utilisateurs', { method: 'POST', token: adm.token, body: { nom: 'U4', prenom: 'T', email: 'u4.p9@test.ci', password: 'x12345', type: 'vendeur' } });
t('4e utilisateur refusé (LIMITE_PLAN)', u4.status === 403 && u4.data?.code === 'LIMITE_PLAN', `${u4.status}`);

// Encaissement abonnement par la plateforme → débloque les limites
console.log('\n— Paiement abonnement —');
const entId = me.data.entreprise._id;
const pay = await api('/api/admin/abonnements', { method: 'POST', token: sa.token, body: { entrepriseId: entId, planCode: 'KIOSQUE', montant: 30000, mois: 3, modePaiement: 'Wave', reference: 'TEST-TXN-1' } });
t('paiement enregistré', pay.status === 201, JSON.stringify(pay.data).slice(0, 150));
const me2 = await api('/api/me', { token: adm.token });
t('plan passé à KIOSQUE actif', me2.data?.entreprise?.abonnement?.planCode === 'KIOSQUE' && me2.data?.entreprise?.abonnement?.statut === 'actif');
t('échéance ~90j', me2.data?.entreprise?.abonnement?.joursRestants >= 88, String(me2.data?.entreprise?.abonnement?.joursRestants));
const k2b = await api('/api/kiosques', { method: 'POST', token: adm.token, body: { designation: 'K2' } });
t('2e kiosque autorisé après upgrade', k2b.status === 201, `${k2b.status}`);
const k3b = await api('/api/kiosques', { method: 'POST', token: adm.token, body: { designation: 'K3' } });
t('3e kiosque autorisé (plan KIOSQUE=3)', k3b.status === 201, `${k3b.status}`);
const k4b = await api('/api/kiosques', { method: 'POST', token: adm.token, body: { designation: 'K4' } });
t('4e kiosque refusé (plafond KIOSQUE)', k4b.status === 403 && k4b.data?.code === 'LIMITE_PLAN', `${k4b.status}`);

// Journal d'activité
console.log('\n— Journal —');
const jr = await api('/api/journal', { token: adm.token });
t('GET /api/journal 200', jr.status === 200 && Array.isArray(jr.data?.entrees));
const jrSa = await api('/api/journal', { token: sa.token });
t('super-admin refusé sur /api/journal', jrSa.status === 403 || jrSa.status === 401, `${jrSa.status}`);

// Paramètres personnels : profil + mot de passe
console.log('\n— Compte personnel —');
const prof = await api('/api/me', { method: 'PATCH', token: adm.token, body: { nom: 'P9b', prenom: 'Admin', telephone: '0102030405' } });
t('PATCH /api/me profil', prof.status === 200);
const mdp = await api('/api/me/mot-de-passe', { method: 'POST', token: adm.token, body: { ancienMotDePasse: 'test1234', nouveauMotDePasse: 'nouv1234' } });
t('changement mdp', mdp.status === 200, JSON.stringify(mdp.data).slice(0, 120));
const relog = await login('admin.p9@test.ci', 'nouv1234');
t('relogin nouveau mdp', relog.status === 200);
const mdpBad = await api('/api/me/mot-de-passe', { method: 'POST', token: relog.token, body: { ancienMotDePasse: 'faux', nouveauMotDePasse: 'x123456' } });
t('mauvais ancien mdp → 400', mdpBad.status === 400);

// Mot de passe oublié
console.log('\n— Reset mot de passe —');
const rd = await api('/api/reset/demande', { method: 'POST', body: { email: 'admin.p9@test.ci' } });
t('demande reset 200 (neutre)', rd.status === 200 && /envoy/i.test(rd.data?.message || ''));
const rdInconnu = await api('/api/reset/demande', { method: 'POST', body: { email: 'inconnu@x.ci' } });
t('demande reset email inconnu → même réponse', rdInconnu.status === 200 && rdInconnu.data?.message === rd.data?.message);
const rdInvalide = await api('/api/reset/confirmer', { method: 'POST', body: { token: 'a'.repeat(64), nouveauMotDePasse: 'y123456' } });
t('token invalide → 400', rdInvalide.status === 400);

console.log(`\n=== ${ok} OK / ${ko} KO ===`);
