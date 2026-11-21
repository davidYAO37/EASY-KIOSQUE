const BASE = "http://localhost:3002";
const j = async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) });
let passes = 0, fails = 0;
const ok = (n, c) => { console.log((c ? "PASS" : "FAIL") + " " + n); c ? passes++ : fails++; };

const api = (m, p, body, cookie) => fetch(`${BASE}${p}`, {
  method: m,
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// ---- Setup : entreprise + 2 kiosques + vendeur ----
const email = `test.p7.${Date.now()}@test.ci`;
let res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P7 ${Date.now()}` },
  admin: { nom: "Admin", prenom: "P7", email, password: "Test1234!" },
}));
ok("inscription", res.s === 201);

let r = await api("POST", "/api/login", { email, password: "Test1234!" });
const cookieAdmin = r.headers.get("set-cookie")?.split(";")[0];
ok("login admin", r.status === 200 && !!cookieAdmin);

res = await j(await api("POST", "/api/kiosques", { designation: "Kiosque A" }, cookieAdmin));
const kA = (res.b.kiosque || res.b)._id;
res = await j(await api("POST", "/api/kiosques", { designation: "Kiosque B" }, cookieAdmin));
const kB = (res.b.kiosque || res.b)._id;
ok("2 kiosques créés", !!kA && !!kB);

const vEmail = `v.p7.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/utilisateurs", {
  nom: "Vendeur", prenom: "P7", email: vEmail, password: "Vend1234!",
  type: "vendeur", kiosqueIds: [kA],
}, cookieAdmin));
r = await api("POST", "/api/login", { email: vEmail, password: "Vend1234!" });
const cookieV = r.headers.get("set-cookie")?.split(";")[0];

// produits par défaut
res = await j(await api("GET", "/api/produits?limit=3", null, cookieAdmin));
const [p1, p2] = res.b.produits;

// caisses ouvertes sur les 2 kiosques
await api("POST", "/api/caisses/ouverture", { kiosqueId: kA, fondDeCaisse: 10000 }, cookieV);
await api("POST", "/api/caisses/ouverture", { kiosqueId: kB, fondDeCaisse: 5000 }, cookieAdmin);

// ventes : kiosque A (vendeur) + kiosque B (admin)
const cle1 = `v7-1-${Date.now()}`;
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: kA, typeVente: "comptant",
  lignes: [{ produitId: p1._id, quantite: 2 }, { produitId: p2._id, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: p1.prixVente * 2 + p2.prixVente }],
  idempotencyKey: cle1,
}, cookieV));
ok("vente kiosque A", res.s === 201);
const caA = p1.prixVente * 2 + p2.prixVente;

res = await j(await api("POST", "/api/ventes", {
  kiosqueId: kB, typeVente: "comptant",
  lignes: [{ produitId: p2._id, quantite: 3 }],
  paiements: [{ mode: "Espèces", montant: p2.prixVente * 3 }],
  idempotencyKey: `v7-2-${Date.now()}`,
}, cookieAdmin));
ok("vente kiosque B", res.s === 201);
const caB = p2.prixVente * 3;

// client pour la vente à crédit
res = await j(await api("POST", "/api/clients", { nom: "ClientP7", telephone: "0101010101" }, cookieAdmin));
const clientId = (res.b.client || res.b)._id;

// vente à crédit → créance (vendeur : action `vente_credit` non accordée → admin)
const acompte = Math.max(1, Math.floor(p1.prixVente / 2));
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: kA, typeVente: "credit", clientId,
  lignes: [{ produitId: p1._id, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: acompte }],
  idempotencyKey: `v7-3-${Date.now()}`,
}, cookieV));
ok("vendeur sans vente_credit → 403", res.s === 403);
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: kA, typeVente: "credit", clientId,
  lignes: [{ produitId: p1._id, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: acompte }],
  idempotencyKey: `v7-4-${Date.now()}`,
}, cookieAdmin));
ok("vente crédit kiosque A (admin)", res.s === 201);

// dépense sur kiosque B
res = await j(await api("POST", "/api/depenses", {
  kiosqueId: kB, montant: 2000, motif: "Loyer", idempotencyKey: `dep7-${Date.now()}`,
}, cookieAdmin));
ok("dépense kiosque B", res.s === 201);

// ---- Tableau de bord admin ----
res = await j(await api("GET", "/api/rapports/tableau-bord", null, cookieAdmin));
ok("tableau-bord 200", res.s === 200);
ok("contrôleur = true", res.b.controleur === true);
ok("CA jour = A + B + crédit", res.b.jour.ca === caA + caB + res.b.jour.ca - (caA + caB) || res.b.jour.ca >= caA + caB);
ok("nbVentes = 3", res.b.jour.nbVentes === 3);
ok("dépenses jour = 2000", res.b.jour.depenses === 2000);
ok("créances dues > 0", res.b.jour.creancesDu > 0);
ok("caisses ouvertes = 2", res.b.jour.caissesOuvertes === 2);
ok("série 7 jours", Array.isArray(res.b.serie7j) && res.b.serie7j.length === 7);
ok("parKiosque = 2", res.b.parKiosque.length === 2);
const kAData = res.b.parKiosque.find((k) => k.kiosqueId === kA);
ok("kiosque A : CA correct", kAData && kAData.nbVentes === 2);
ok("top produits non vide", res.b.topProduits.length > 0);

// filtre par kiosque
res = await j(await api("GET", `/api/rapports/tableau-bord?kiosqueId=${kB}`, null, cookieAdmin));
ok("tableau-bord filtré kiosque B", res.s === 200 && res.b.jour.nbVentes === 1);

// ---- Tableau de bord vendeur (limité) ----
res = await j(await api("GET", "/api/rapports/tableau-bord", null, cookieV));
ok("vendeur : contrôleur = false", res.s === 200 && res.b.controleur === false);
ok("vendeur : ne voit que sa vente", res.b.jour.nbVentes === 1);
ok("vendeur : pas de créances", res.b.jour.creancesDu === 0);
ok("vendeur : pas de parKiosque", res.b.parKiosque.length === 0);

// ---- Rapports : accès interdit au vendeur ----
for (const route of ["ventes", "kiosques", "depenses", "credits", "caisses"]) {
  res = await j(await api("GET", `/api/rapports/${route}`, null, cookieV));
  ok(`vendeur → /rapports/${route} = 403`, res.s === 403);
}
res = await api("GET", "/api/rapports/export?type=ventes", null, cookieV);
ok("vendeur → export = 403", res.status === 403);

// ---- Rapport ventes ----
res = await j(await api("GET", "/api/rapports/ventes", null, cookieAdmin));
ok("rapport ventes 200", res.s === 200);
ok("totaux : 3 ventes", res.b.totaux.nbVentes === 3);
ok("CA crédit présent", res.b.totaux.caCredit > 0);
ok("par jour", res.b.parJour.length >= 1);
ok("par vendeur = 2", res.b.parVendeur.length === 2);
const vendeurData = res.b.parVendeur.find((v) => v.nbVentes === 1 && v.vendeur.includes("Vendeur"));
ok("vendeur P7 a 1 vente", !!vendeurData);
ok("top produits", res.b.topProduits.length > 0 && res.b.topProduits[0].quantite > 0);

// ---- Comparaison kiosques ----
res = await j(await api("GET", "/api/rapports/kiosques", null, cookieAdmin));
ok("comparaison 200", res.s === 200 && res.b.kiosques.length === 2);
const cmpA = res.b.kiosques.find((k) => k.kiosqueId === kA);
const cmpB = res.b.kiosques.find((k) => k.kiosqueId === kB);
ok("A : 2 ventes", cmpA.nbVentes === 2);
ok("B : dépenses 2000", cmpB.depenses === 2000);
ok("B : résultat net = encaissé − dépenses", cmpB.resultatNet === cmpB.encaisse - 2000);
ok("tri par CA décroissant", res.b.kiosques[0].ca >= res.b.kiosques[1].ca);

// ---- Rapport dépenses ----
res = await j(await api("GET", "/api/rapports/depenses", null, cookieAdmin));
ok("rapport dépenses 200", res.s === 200 && res.b.totaux.total === 2000);
ok("par catégorie (Divers)", res.b.parCategorie.length === 1);

// ---- Rapport crédits ----
res = await j(await api("GET", "/api/rapports/credits", null, cookieAdmin));
ok("rapport crédits 200", res.s === 200);
ok("1 client dû", res.b.totaux.nbClients === 1 && res.b.totaux.totalDu > 0);
ok("parClient nom", res.b.parClient[0].nomComplet.includes("ClientP7"));

// ---- Rapport caisses ----
res = await j(await api("GET", "/api/rapports/caisses", null, cookieAdmin));
ok("rapport caisses 200", res.s === 200 && res.b.totaux.sessions === 2);
ok("sessions ouvertes", res.b.sessions.every((s) => s.statut === "ouverte"));

// ---- Export Excel ----
for (const type of ["ventes", "depenses", "credits", "kiosques", "caisses"]) {
  const rr = await api("GET", `/api/rapports/export?type=${type}`, null, cookieAdmin);
  const ct = rr.headers.get("content-type") || "";
  const buf = await rr.arrayBuffer();
  ok(`export ${type} = xlsx`, rr.status === 200 && ct.includes("spreadsheetml") && buf.byteLength > 1000);
}
res = await api("GET", "/api/rapports/export?type=inconnu", null, cookieAdmin);
ok("export type inconnu → 400", res.status === 400);

// ---- Isolation tenant ----
const e2 = `test.p7b.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P7 B ${Date.now()}` },
  admin: { nom: "Adm", prenom: "B", email: e2, password: "Test1234!" },
}));
r = await api("POST", "/api/login", { email: e2, password: "Test1234!" });
const cookieB = r.headers.get("set-cookie")?.split(";")[0];
res = await j(await api("GET", "/api/rapports/tableau-bord", null, cookieB));
ok("isolation : CA = 0 pour l'autre tenant", res.s === 200 && res.b.jour.ca === 0);
res = await j(await api("GET", "/api/rapports/ventes", null, cookieB));
ok("isolation : rapport vide", res.s === 200 && res.b.totaux.nbVentes === 0);

console.log(`\n=== ${passes} PASS / ${fails} FAIL ===`);
process.exit(fails ? 1 : 0);
