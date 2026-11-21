const BASE = "http://localhost:3002";
const j = async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) });
let passes = 0, fails = 0;
const ok = (n, c) => { console.log((c ? "PASS" : "FAIL") + " " + n); c ? passes++ : fails++; };

const api = (m, p, body, cookie) => fetch(`${BASE}${p}`, {
  method: m,
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// ===================== Setup : 2 tenants complets =====================
async function tenant(tag) {
  const email = `t.${tag}.${Date.now()}@test.ci`;
  await api("POST", "/api/inscription", {
    entreprise: { nomSociete: `TEST P8 ${tag} ${Date.now()}` },
    admin: { nom: "Admin", prenom: tag, email, password: "Test1234!" },
  });
  const r = await api("POST", "/api/login", { email, password: "Test1234!" });
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  const k = await j(await api("POST", "/api/kiosques", { designation: `Kio ${tag}` }, cookie));
  const kid = (k.b.kiosque || k.b)._id;
  await api("POST", "/api/caisses/ouverture", { kiosqueId: kid, fondDeCaisse: 10000 }, cookie);
  const p = await j(await api("GET", "/api/produits?limit=1", null, cookie));
  const produit = p.b.produits[0];
  const v = await j(await api("POST", "/api/ventes", {
    kiosqueId: kid, typeVente: "comptant",
    lignes: [{ produitId: produit._id, quantite: 1 }],
    paiements: [{ mode: "Espèces", montant: produit.prixVente }],
    idempotencyKey: `p8-${tag}-${Date.now()}`,
  }, cookie));
  const dep = await j(await api("POST", "/api/depenses", {
    kiosqueId: kid, montant: 100, motif: "t", idempotencyKey: `d8-${tag}-${Date.now()}`,
  }, cookie));
  const cl = await j(await api("POST", "/api/clients", { nom: `Client${tag}` }, cookie));
  return {
    email, cookie, kid, produitId: produit._id,
    venteId: v.b.vente?._id || v.b._id,
    depenseId: dep.b.depense?._id,
    clientId: (cl.b.client || cl.b)._id,
    tag,
  };
}

const A = await tenant("A");
const B = await tenant("B");
ok("2 tenants provisionnés", !!A.cookie && !!B.cookie && !!A.venteId && !!B.venteId);

// ===================== A. Authentification =====================
for (const p of ["/api/me", "/api/ventes", "/api/produits", "/api/depenses", "/api/caisses"]) {
  const res = await api("GET", p, null, null);
  ok(`sans cookie → ${p} = 401`, res.status === 401);
}
let res = await api("GET", "/api/ventes", null, "ek_token=jeton.forge.invalide");
ok("jeton forgé → 401", res.status === 401);
res = await api("GET", "/api/ventes", null, "ek_token=");
ok("jeton vide → 401", res.status === 401);

// ===================== B. Isolation multi-tenant =====================
// Listes : A ne voit jamais les données de B
res = await j(await api("GET", "/api/ventes?limit=50", null, A.cookie));
ok("ventes : A ne voit que les siennes", res.b.ventes?.every((v) => v._id !== B.venteId) !== false);
res = await j(await api("GET", "/api/kiosques", null, A.cookie));
ok("kiosques : A ne voit pas B", res.b.kiosques.every((k) => k._id !== B.kid));
res = await j(await api("GET", "/api/depenses?limit=50", null, A.cookie));
ok("dépenses : A ne voit pas B", !res.b.items?.some((d) => d._id === B.depenseId));
res = await j(await api("GET", "/api/clients?limit=50", null, A.cookie));
ok("clients : A ne voit pas B", !res.b.clients?.some((c) => c._id === B.clientId));

// Accès directs par ID de B → 404/403 jamais 200
res = await api("GET", `/api/produits/${B.produitId}`, null, A.cookie);
ok("produit B par A → 404", res.status === 404);
res = await api("GET", `/api/depenses/${B.depenseId}`, null, A.cookie);
ok("dépense B par A → 404", res.status === 404);
res = await api("GET", `/api/ventes/${B.venteId}`, null, A.cookie);
ok("vente B par A → 403/404", [403, 404].includes(res.status));
res = await api("GET", `/api/clients/${B.clientId}`, null, A.cookie);
ok("client B par A → 404", res.status === 404);
res = await api("GET", `/api/caisses/${B.kid}`, null, A.cookie);
ok("caisse B par A → 403/404", [403, 404].includes(res.status));

// Écritures pointant sur le kiosque de B → refusées
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: B.kid, typeVente: "comptant",
  lignes: [{ produitId: A.produitId, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: 100 }],
  idempotencyKey: `p8-cross-${Date.now()}`,
}, A.cookie));
ok("vente sur kiosque B par A → refusée", [400, 403, 404].includes(res.s));
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: B.kid, montant: 50, idempotencyKey: `d8-cross-${Date.now()}`,
}, A.cookie));
ok("dépense sur kiosque B par A → refusée", [400, 403, 404].includes(res.s));
res = await j(await api("POST", "/api/caisses/ouverture", { kiosqueId: B.kid, fondDeCaisse: 0 }, A.cookie));
ok("ouverture caisse sur kiosque B par A → refusée", [400, 403, 404].includes(res.s));

// entreprise B modifiable par A ? → jamais
res = await api("PATCH", `/api/entreprises/${"0".repeat(24)}`, { statut: "suspendu" }, A.cookie);
ok("A ne peut pas suspendre une entreprise", [401, 403, 404].includes(res.status));

// ===================== C. Vendeur : restrictions =====================
const vEmail = `v.p8.${Date.now()}@test.ci`;
await api("POST", "/api/utilisateurs", {
  nom: "V", prenom: "P8", email: vEmail, password: "Vend1234!", type: "vendeur", kiosqueIds: [A.kid],
}, A.cookie);
let r = await api("POST", "/api/login", { email: vEmail, password: "Vend1234!" });
const cookieV = r.headers.get("set-cookie")?.split(";")[0];

res = await api("GET", "/api/produits?limit=1", null, cookieV);
ok("vendeur : catalogue lisible", res.status === 200);
for (const [m, p, body] of [
  ["PUT", `/api/produits/${A.produitId}`, { prixVente: 1 }],
  ["POST", "/api/depenses", { kiosqueId: A.kid, montant: 10, idempotencyKey: `v8-${Date.now()}` }],
  ["POST", `/api/ventes/${A.venteId}/annulation`, { motif: "test" }],
  ["GET", "/api/rapports/ventes", null],
  ["GET", "/api/rapports/export?type=ventes", null],
  ["POST", "/api/utilisateurs", { nom: "X", email: "x@test.ci", password: "x", type: "vendeur" }],
  ["GET", "/api/notifications?limit=5", null],
  ["POST", "/api/caisses/" + A.kid + "/cloturer", {}],
]) {
  const rr = await api(m, p, body, cookieV);
  ok(`vendeur ${m} ${p} → 403`, rr.status === 403);
}

// ===================== D. Validation serveur =====================
// champs tarifaires injectés par le navigateur → Zod strict rejette
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: A.kid, typeVente: "comptant", prixUnitaire: 1, montantTotal: 1,
  lignes: [{ produitId: A.produitId, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: 1 }],
  idempotencyKey: `p8-zod-${Date.now()}`,
}, A.cookie));
ok("vente avec prix/total injectés → 400", res.s === 400);

res = await j(await api("POST", "/api/ventes", {
  kiosqueId: A.kid, typeVente: "comptant", entrepriseId: "0".repeat(24), vendeurId: "0".repeat(24),
  lignes: [{ produitId: A.produitId, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: 100 }],
  idempotencyKey: `p8-zod2-${Date.now()}`,
}, A.cookie));
ok("vente avec entrepriseId/vendeurId injectés → 400", res.s === 400);

res = await j(await api("POST", "/api/depenses", {
  kiosqueId: { $gt: "" }, montant: 10, idempotencyKey: `d8-inj-${Date.now()}`,
}, A.cookie));
ok("injection objet dans kiosqueId → 400", res.s === 400);

res = await j(await api("POST", "/api/depenses", {
  kiosqueId: A.kid, montant: -50, idempotencyKey: `d8-neg-${Date.now()}`,
}, A.cookie));
ok("montant négatif → 400", res.s === 400);

res = await j(await api("POST", "/api/depenses", {
  kiosqueId: A.kid, montant: 2_000_000_000, idempotencyKey: `d8-big-${Date.now()}`,
}, A.cookie));
ok("montant > plafond → 400", res.s === 400);

res = await j(await api("POST", "/api/depenses", {
  kiosqueId: "pas-un-objectid", montant: 10, idempotencyKey: `d8-oid-${Date.now()}`,
}, A.cookie));
ok("kiosqueId non-ObjectId → 4xx", res.s >= 400 && res.s < 500);

// idempotence : même clé dans A et B → pas de conflit (clé scopée tenant)
const cleCom = `cle-partagee-${Date.now()}`;
res = await j(await api("POST", "/api/depenses", { kiosqueId: A.kid, montant: 100, idempotencyKey: cleCom }, A.cookie));
ok("idempotence A", res.s === 201);
const res2 = await j(await api("POST", "/api/depenses", { kiosqueId: B.kid, montant: 100, idempotencyKey: cleCom }, B.cookie));
ok("même clé en B → indépendante", res2.s === 201 && res2.b.depense._id !== res.b.depense._id);

// email déjà utilisé → 409
res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: "TEST P8 DOUBLON" },
  admin: { nom: "D", email: A.email, password: "Test1234!" },
}));
ok("inscription email existant → 409", res.s === 409);

// ===================== E. Verrouillage de compte =====================
const lockEmail = `lock.p8.${Date.now()}@test.ci`;
await api("POST", "/api/utilisateurs", {
  nom: "Lock", email: lockEmail, password: "Lock1234!", type: "vendeur", kiosqueIds: [A.kid],
}, A.cookie);
for (let i = 0; i < 4; i++) {
  await api("POST", "/api/login", { email: lockEmail, password: "mauvais" });
}
res = await api("POST", "/api/login", { email: lockEmail, password: "Lock1234!" });
ok("compte verrouillé après échecs → 423", res.status === 423);

// ===================== F. Suspension entreprise =====================
r = await api("POST", "/api/login", { email: "superadmin@easy-kiosque.local", password: "admin123" });
const cookieSuper = r.headers.get("set-cookie")?.split(";")[0];
ok("login super-admin", r.status === 200 && !!cookieSuper);

if (cookieSuper) {
  // id de l'entreprise A via /api/me
  const me = await j(await api("GET", "/api/me", null, A.cookie));
  const eidA = me.b.user?.entrepriseId || me.b.entreprise?._id;
  res = await api("PATCH", `/api/entreprises/${eidA}`, { statut: "suspendu" }, cookieSuper);
  ok("suspension entreprise A", res.status === 200);
  res = await api("GET", "/api/ventes", null, A.cookie);
  ok("tenant suspendu → 402", res.status === 402);
  res = await api("GET", "/api/produits", null, A.cookie);
  ok("tenant suspendu → produits 402", res.status === 402);
  res = await api("PATCH", `/api/entreprises/${eidA}`, { statut: "actif" }, cookieSuper);
  ok("réactivation entreprise A", res.status === 200);
  res = await api("GET", "/api/ventes", null, A.cookie);
  ok("après réactivation → 200", res.status === 200);
  // le super-admin n'accède pas aux données métier
  res = await api("GET", "/api/ventes", null, cookieSuper);
  ok("super-admin → métier refusé", [400, 403].includes(res.status));
} else {
  ok("suspension (superadmin indisponible)", false);
}

console.log(`\n=== ${passes} PASS / ${fails} FAIL ===`);
process.exit(fails ? 1 : 0);
