import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../lib/offlineQueue.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const stockage = new Map();
const module = { exports: {} };
const a = { _id: 'vendeur-a', entrepriseId: 'entreprise-a' };
const b = { _id: 'vendeur-b', entrepriseId: 'entreprise-b' };
let courant = a;
let statut = 200;
let posts = 0;
let pendantEnvoi = () => {};
const evenements = [];
vm.runInNewContext(code, {
  module, exports: module.exports,
  localStorage: { getItem: (k) => stockage.get(k) ?? null, setItem: (k, v) => stockage.set(k, v) },
  window: { dispatchEvent: (e) => evenements.push(e.type) },
  Event: class { constructor(type) { this.type = type; } },
  CustomEvent: class { constructor(type) { this.type = type; } },
  fetch: async (url) => {
    if (url === '/api/me') return { ok: true, json: async () => ({ user: courant }) };
    assert.equal(url, '/api/ventes');
    posts++;
    pendantEnvoi();
    return { ok: statut === 200, status: statut, json: async () => ({ message: 'Test rejet' }) };
  },
});
const q = module.exports;
const vente = (id, kiosqueId = 'kiosque-a') => ({ idempotencyKey: id, kiosqueId, lignes: [{ produitId: 'produit', quantite: 1 }] });
stockage.set('ek_offline_ventes', JSON.stringify([{ payload: vente('ancienne') }]));
q.ajouterVenteHorsLigne(vente('a1'), 500, a);
q.ajouterVenteHorsLigne(vente('a1'), 500, a);
q.ajouterVenteHorsLigne(vente('b1', 'kiosque-b'), 500, b);
assert.equal(q.compterVentesHorsLigne(a), 1);
assert.equal(q.compterVentesHorsLigne(b), 1);
assert.equal(q.ventesHorsLignePourKiosque('kiosque-b', a).length, 0);
assert.equal(q.anciennesVentesHorsLigne(), 1);
assert.throws(() => q.ajouterVenteHorsLigne(vente('sans-session'), 500, { _id: '' }));

courant = b;
await q.synchroniserVentesHorsLigne(a);
assert.equal(posts, 0);
assert.equal(q.compterVentesHorsLigne(a), 1);

courant = a;
pendantEnvoi = () => { q.ajouterVenteHorsLigne(vente('a2'), 600, a); pendantEnvoi = () => {}; };
const p1 = q.synchroniserVentesHorsLigne(a);
const p2 = q.synchroniserVentesHorsLigne(a);
assert.equal(p1, p2);
const r = await p1;
assert.equal(r.envoyees, 1);
assert.equal(r.restantes, 1);
assert.equal(q.compterVentesHorsLigne(b), 1);
assert.equal(q.anciennesVentesHorsLigne(), 1);
assert.ok(evenements.includes('ek-donnees-change'));

statut = 402;
await q.synchroniserVentesHorsLigne(a);
assert.equal(q.compterVentesHorsLigne(a), 1);
assert.equal(q.ventesRejetees(a).length, 0);
statut = 400;
await q.synchroniserVentesHorsLigne(a);
assert.equal(q.compterVentesHorsLigne(a), 0);
assert.equal(q.ventesRejetees(a).length, 1);
assert.equal(q.ventesRejetees(b).length, 0);
assert.equal(q.compterVentesHorsLigne(b), 1);
assert.equal(q.anciennesVentesHorsLigne(), 1);
console.log('Isolation hors-ligne : 21 assertions réussies, aucune connexion à une base réelle.');
