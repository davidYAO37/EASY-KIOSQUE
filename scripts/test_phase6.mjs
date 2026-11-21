const BASE = "http://localhost:3002";
const j = async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) });
let passes = 0, fails = 0;
const ok = (n, c) => { console.log((c ? "PASS" : "FAIL") + " " + n); c ? passes++ : fails++; };

const api = (m, p, body, cookie) => fetch(`${BASE}${p}`, {
  method: m,
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// ---- Setup : entreprise + kiosque ----
const email = `test.p6.${Date.now()}@test.ci`;
let res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P6 ${Date.now()}` },
  admin: { nom: "Admin", prenom: "P6", email, password: "Test1234!" },
}));
ok("inscription", res.s === 201);

let r = await api("POST", "/api/login", { email, password: "Test1234!" });
const cookieAdmin = r.headers.get("set-cookie")?.split(";")[0];
ok("login admin", r.status === 200 && !!cookieAdmin);

// catégories de dépenses par défaut
res = await j(await api("GET", "/api/depenses/categories", null, cookieAdmin));
const cats = res.b.categories || [];
ok("6 catégories de dépenses par défaut", res.s === 200 && cats.length === 6);
ok("codes CD### présents", cats.some((c) => c.code === "CD001") && cats.some((c) => c.designation === "Loyer"));
const catFournisseurs = cats.find((c) => c.code === "CD001");

res = await j(await api("POST", "/api/kiosques", { designation: "Kiosque P6" }, cookieAdmin));
const kid = (res.b.kiosque || res.b)._id;
ok("kiosque créé", res.s === 201 && !!kid);

// vendeur SANS permission dépense (défaut)
const v1Email = `v1.p6.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/utilisateurs", {
  nom: "Vendeur", prenom: "Sans", email: v1Email, password: "Vend1234!",
  type: "vendeur", kiosqueIds: [kid],
}, cookieAdmin));
r = await api("POST", "/api/login", { email: v1Email, password: "Vend1234!" });
const cookieV1 = r.headers.get("set-cookie")?.split(";")[0];

// vendeur AVEC autorisation du propriétaire (permissions personnalisées)
const v2Email = `v2.p6.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/utilisateurs", {
  nom: "Vendeur", prenom: "Avec", email: v2Email, password: "Vend1234!",
  type: "vendeur", kiosqueIds: [kid],
  permissions: { customized: true, services: ["accueil", "ventes", "depenses"], actions: ["enregistrer_vente", "ouvrir_caisse", "enregistrer_depense"] },
}, cookieAdmin));
ok("vendeur autorisé créé", res.s === 201);
r = await api("POST", "/api/login", { email: v2Email, password: "Vend1234!" });
const cookieV2 = r.headers.get("set-cookie")?.split(";")[0];
ok("login vendeur autorisé", r.status === 200 && !!cookieV2);

// ---- Dépense sans caisse ouverte ----
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, categorieDepenseId: catFournisseurs._id, montant: 500,
  motif: "test", idempotencyKey: `dep-x-${Date.now()}`,
}, cookieAdmin));
ok("dépense sans caisse → CAISSE_FERMEE", res.s === 400 && res.b.code === "CAISSE_FERMEE");

// ---- Ouverture caisse (fond 20 000) ----
res = await j(await api("POST", "/api/caisses/ouverture", { kiosqueId: kid, fondDeCaisse: 20000 }, cookieV2));
ok("ouverture caisse", res.s === 201);

// ---- Dépense admin ----
const cleDep1 = `dep-p6-${Date.now()}-1`;
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, categorieDepenseId: catFournisseurs._id, montant: 3000,
  motif: "Achat gaz", idempotencyKey: cleDep1,
}, cookieAdmin));
ok("dépense admin enregistrée", res.s === 201 && res.b.depense.numero.startsWith("DEP-") && res.b.depense.statut === "validee");
const dep1 = res.b.depense;

// solde caisse : 20000 - 3000
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("solde théorique = fond − dépense", res.b.session.soldeTheorique === 20000 - 3000);

// idempotence
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, categorieDepenseId: catFournisseurs._id, montant: 3000,
  motif: "Achat gaz", idempotencyKey: cleDep1,
}, cookieAdmin));
ok("idempotence dépense", res.s === 201 && res.b.dupliquee === true && res.b.depense._id === dep1._id);

res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("solde inchangé après doublon", res.b.session.soldeTheorique === 17000);

// ---- Vendeur SANS permission ----
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, montant: 100, idempotencyKey: `dep-v1-${Date.now()}`,
}, cookieV1));
ok("vendeur non autorisé → POST 403", res.s === 403);
res = await j(await api("GET", "/api/depenses", null, cookieV1));
ok("vendeur non autorisé → GET 403", res.s === 403);
res = await j(await api("GET", "/api/depenses/categories", null, cookieV1));
ok("vendeur non autorisé → catégories 403", res.s === 403);

// ---- Vendeur AUTORISÉ par le propriétaire ----
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, categorieDepenseId: catFournisseurs._id, montant: 1500,
  motif: "Réparation vitrine", idempotencyKey: `dep-v2-${Date.now()}`,
}, cookieV2));
ok("vendeur autorisé : dépense enregistrée", res.s === 201 && res.b.depense.statut === "validee");
const depV2 = res.b.depense;

// le vendeur autorisé ne voit que SES dépenses
res = await j(await api("GET", "/api/depenses?limit=50", null, cookieV2));
ok("vendeur : ne voit que ses dépenses", res.s === 200 && res.b.items.length === 1 && res.b.items[0]._id === depV2._id);

// le vendeur ne peut pas annuler
res = await j(await api("POST", `/api/depenses/${depV2._id}/annuler`, { motif: "test motif" }, cookieV2));
ok("vendeur : annulation interdite", res.s === 403);

// solde : 20000 - 3000 - 1500 = 15500
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("solde après dépense vendeur", res.b.session.soldeTheorique === 15500);

// ---- Annulation par le propriétaire ----
res = await j(await api("POST", `/api/depenses/${dep1._id}/annuler`, {}, cookieAdmin));
ok("annulation sans motif → 400", res.s === 400);

res = await j(await api("POST", `/api/depenses/${dep1._id}/annuler`, { motif: "Erreur de saisie du montant" }, cookieAdmin));
ok("annulation tracée", res.s === 200 && res.b.depense.statut === "annulee" && res.b.depense.annulation.motif === "Erreur de saisie du montant");

res = await j(await api("POST", `/api/depenses/${dep1._id}/annuler`, { motif: "encore" }, cookieAdmin));
ok("double annulation → 409", res.s === 409);

// solde restauré : 15500 + 3000 = 18500 (compensation entrée)
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("compensation : solde restauré", res.b.session.soldeTheorique === 18500);

// la dépense annulée est conservée (historique inaltérable)
res = await j(await api("GET", `/api/depenses/${dep1._id}`, null, cookieAdmin));
ok("dépense annulée conservée en base", res.s === 200 && res.b.depense.statut === "annulee");

// totalValidees = 1500 (seule la dépense vendeur valide)
res = await j(await api("GET", "/api/depenses?limit=50", null, cookieAdmin));
ok("totalValidees exclut les annulées", res.b.totalValidees === 1500 && res.b.total === 2);

// ---- Catégories : CRUD réservé admin/gestionnaire ----
res = await j(await api("POST", "/api/depenses/categories", { designation: "Gardiennage" }, cookieAdmin));
ok("catégorie créée (CD007)", res.s === 201 && res.b.categorie.code === "CD007");
const catGard = res.b.categorie;

res = await j(await api("POST", "/api/depenses/categories", { designation: "X" }, cookieV2));
ok("vendeur : création catégorie interdite", res.s === 403);

res = await j(await api("PATCH", `/api/depenses/categories/${catGard._id}`, { designation: "Gardiennage site" }, cookieAdmin));
ok("catégorie renommée", res.s === 200 && res.b.categorie.designation === "Gardiennage site");

res = await j(await api("PATCH", `/api/depenses/categories/${catGard._id}`, { statut: "inactif" }, cookieAdmin));
ok("catégorie désactivée", res.s === 200 && res.b.categorie.statut === "inactif");

res = await j(await api("GET", "/api/depenses/categories", null, cookieAdmin));
ok("catégorie inactive masquée de la liste", !res.b.categories.some((c) => c._id === catGard._id));
res = await j(await api("GET", "/api/depenses/categories?tout=1", null, cookieAdmin));
ok("catégorie inactive visible avec tout=1", res.b.categories.some((c) => c._id === catGard._id));

// dépense sur catégorie inactive → rejetée
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kid, categorieDepenseId: catGard._id, montant: 100, idempotencyKey: `dep-inact-${Date.now()}`,
}, cookieAdmin));
ok("dépense sur catégorie inactive → rejetée", res.s === 400);

// ---- Isolation tenant ----
const e2 = `test.p6b.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P6 B ${Date.now()}` },
  admin: { nom: "Adm", prenom: "B", email: e2, password: "Test1234!" },
}));
r = await api("POST", "/api/login", { email: e2, password: "Test1234!" });
const cookieB = r.headers.get("set-cookie")?.split(";")[0];
res = await j(await api("GET", "/api/depenses?limit=50", null, cookieB));
ok("isolation : aucune dépense d'un autre tenant", res.s === 200 && res.b.total === 0);
res = await j(await api("GET", `/api/depenses/${dep1._id}`, null, cookieB));
ok("isolation : détail inaccessible", res.s === 404);

console.log(`\n=== ${passes} PASS / ${fails} FAIL ===`);
process.exit(fails ? 1 : 0);
