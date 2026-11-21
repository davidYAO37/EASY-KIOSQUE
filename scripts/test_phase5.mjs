const BASE = "http://localhost:3002";
const j = async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) });
let passes = 0, fails = 0;
const ok = (n, c) => { console.log((c ? "PASS" : "FAIL") + " " + n); c ? passes++ : fails++; };

const api = (m, p, body, cookie) => fetch(`${BASE}${p}`, {
  method: m,
  headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// ---- Setup : entreprise + kiosque + vendeur ----
const email = `test.p5.${Date.now()}@test.ci`;
let res = await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P5 ${Date.now()}` },
  admin: { nom: "Admin", prenom: "P5", email, password: "Test1234!" },
}));
ok("inscription", res.s === 201);

let r = await api("POST", "/api/login", { email, password: "Test1234!" });
const cookieAdmin = r.headers.get("set-cookie")?.split(";")[0];
ok("login admin", r.status === 200 && !!cookieAdmin);

res = await j(await api("POST", "/api/kiosques", { designation: "Kiosque P5" }, cookieAdmin));
const kiosque = res.b.kiosque || res.b;
const kid = kiosque._id;
ok("kiosque créé", res.s === 201 && !!kid);

// vendeur affecté au kiosque
const vEmail = `v.p5.${Date.now()}@test.ci`;
res = await j(await api("POST", "/api/utilisateurs", {
  nom: "Vendeur", prenom: "P5", email: vEmail, password: "Vend1234!",
  type: "vendeur", kiosqueIds: [kid],
}, cookieAdmin));
ok("vendeur créé", res.s === 201);
r = await api("POST", "/api/login", { email: vEmail, password: "Vend1234!" });
const cookieV = r.headers.get("set-cookie")?.split(";")[0];
ok("login vendeur", r.status === 200 && !!cookieV);

// produits par défaut
res = await j(await api("GET", "/api/produits?limit=2", null, cookieAdmin));
const [p1, p2] = res.b.produits;
ok("produits présents", !!p1 && !!p2);

// ---- Remise sans caisse ouverte ----
res = await j(await api("POST", "/api/remises",
  { kiosqueId: kid, montant: 1000, idempotencyKey: `rem-x-${Date.now()}` }, cookieV));
ok("remise sans caisse → CAISSE_FERMEE", res.s === 400 && res.b.code === "CAISSE_FERMEE");

// ---- Ouverture ----
res = await j(await api("POST", "/api/caisses/ouverture", { kiosqueId: kid, fondDeCaisse: 10000 }, cookieV));
ok("vendeur ouvre la caisse (fond 10 000)", res.s === 201 && res.b.session.numero.startsWith("CAI-"));
const sessionId = res.b.session._id;

res = await j(await api("POST", "/api/caisses/ouverture", { kiosqueId: kid, fondDeCaisse: 0 }, cookieAdmin));
ok("double ouverture → 409", res.s === 409 && res.b.code === "CAISSE_DEJA_OUVERTE");

// ---- Vente comptant dans la session ----
res = await j(await api("POST", "/api/ventes", {
  kiosqueId: kid, typeVente: "comptant",
  lignes: [{ produitId: p1._id, quantite: 2 }, { produitId: p2._id, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: p1.prixVente * 2 + p2.prixVente, montantRecu: p1.prixVente * 2 + p2.prixVente }],
  idempotencyKey: `v-p5-${Date.now()}`,
}, cookieV));
ok("vente vendeur", res.s === 201);
const totalVente = p1.prixVente * 2 + p2.prixVente;

// ---- Caisse actuelle : admin voit solde, vendeur non ----
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("admin voit solde théorique", res.s === 200 && res.b.session.soldeTheorique === 10000 + totalVente);
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieV));
ok("vendeur : solde masqué (comptage aveugle)", res.s === 200 && res.b.session && res.b.session.soldeTheorique === undefined);

// ---- Remise vendeur ----
res = await j(await api("POST", "/api/remises",
  { kiosqueId: kid, montant: 99999999, idempotencyKey: `rem-big-${Date.now()}` }, cookieV));
ok("remise > disponible → MONTANT_EXCESSIF", res.s === 400 && res.b.code === "MONTANT_EXCESSIF");

const cleRem = `rem-p5-${Date.now()}`;
res = await j(await api("POST", "/api/remises",
  { kiosqueId: kid, montant: 5000, note: "fin de journée", idempotencyKey: cleRem }, cookieV));
ok("vendeur déclare remise 5000", res.s === 201 && res.b.remise.numero.startsWith("REM-") && res.b.remise.statut === "declaree");
const remiseId = res.b.remise._id;

res = await j(await api("POST", "/api/remises",
  { kiosqueId: kid, montant: 5000, idempotencyKey: cleRem }, cookieV));
ok("idempotence remise (dupliquee)", res.s === 201 && res.b.dupliquee === true && res.b.remise._id === remiseId);

// vendeur ne peut PAS confirmer
res = await j(await api("POST", `/api/remises/${remiseId}/confirmer`, {}, cookieV));
ok("vendeur confirmer remise → 403", res.s === 403);

// solde inchangé avant confirmation
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("remise déclarée : solde inchangé + en attente", res.b.session.soldeTheorique === 10000 + totalVente && res.b.session.remisesEnAttente === 5000);

res = await j(await api("POST", `/api/remises/${remiseId}/confirmer`, {}, cookieAdmin));
ok("admin confirme remise", res.s === 200 && res.b.remise.statut === "confirmee");

res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("solde − 5000 après confirmation", res.b.session.soldeTheorique === 10000 + totalVente - 5000);
const soldeAttendu = 10000 + totalVente - 5000;

// double confirmation → 409
res = await j(await api("POST", `/api/remises/${remiseId}/confirmer`, {}, cookieAdmin));
ok("double confirmation → 409", res.s === 409);

// ---- Point journalier vendeur (avec écart) ----
res = await j(await api("POST", `/api/caisses/${sessionId}/point`, { montantCompte: soldeAttendu - 200, commentaire: "comptage soir" }, cookieV));
ok("vendeur déclare son point", res.s === 200 && res.b.session.statut === "en_cloture");
ok("point : écart masqué au vendeur", res.b.session.pointEnAttente === undefined);

res = await j(await api("POST", `/api/caisses/${sessionId}/point`, { montantCompte: 0 }, cookieV));
ok("double point → 409", res.s === 409);

res = await j(await api("GET", `/api/caisses/${sessionId}`, null, cookieAdmin));
ok("admin voit écart -200", res.b.session.pointEnAttente?.ecart === -200);

// vendeur ne peut PAS clôturer ni rejeter
res = await j(await api("POST", `/api/caisses/${sessionId}/cloturer`, {}, cookieV));
ok("vendeur clôturer → 403", res.s === 403);
res = await j(await api("POST", `/api/caisses/${sessionId}/rouvrir`, {}, cookieV));
ok("vendeur rouvrir → 403", res.s === 403);

// rejet du point → réouverture → nouveau point exact
res = await j(await api("POST", `/api/caisses/${sessionId}/rouvrir`, { commentaire: "recomptage requis" }, cookieAdmin));
ok("admin rejette le point → ouverte", res.s === 200 && res.b.session.statut === "ouverte");
ok("point rejeté conservé (audit)", res.b.session.points?.length === 1 && res.b.session.points[0].statut === "rejete");

res = await j(await api("POST", `/api/caisses/${sessionId}/point`, { montantCompte: soldeAttendu }, cookieV));
ok("vendeur refait le point (exact)", res.s === 200 && res.b.session.statut === "en_cloture");

// ---- Clôture ----
res = await j(await api("POST", `/api/caisses/${sessionId}/cloturer`, { commentaire: "OK" }, cookieAdmin));
ok("admin clôture (écart 0)", res.s === 200 && res.b.session.statut === "cloturee" && res.b.session.cloture.ecart === 0);

res = await j(await api("POST", `/api/caisses/${sessionId}/cloturer`, {}, cookieAdmin));
ok("double clôture → 409", res.s === 409);

// ---- Remise annulée ----
res = await j(await api("POST", "/api/caisses/ouverture", { kiosqueId: kid, fondDeCaisse: 500 }, cookieV));
const s2 = res.b.session._id;
ok("réouverture caisse jour 2 (fond 500)", res.s === 201);
res = await j(await api("POST", "/api/remises", { kiosqueId: kid, montant: 100, idempotencyKey: `rem-ann-${Date.now()}` }, cookieV));
const r2 = res.b.remise._id;
res = await j(await api("POST", `/api/remises/${r2}/annuler`, { motif: "montant erroné" }, cookieAdmin));
ok("admin annule remise (motif)", res.s === 200 && res.b.remise.statut === "annulee");
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieAdmin));
ok("solde inchangé après annulation remise", res.b.session.soldeTheorique === 500);

// ---- Vendeur : historique sessions interdit ----
res = await j(await api("GET", "/api/caisses", null, cookieV));
ok("vendeur liste sessions → 403", res.s === 403);
res = await j(await api("GET", `/api/caisses/${sessionId}/mouvements`, null, cookieV));
ok("vendeur mouvements → 403", res.s === 403);
// mais il voit SES remises
res = await j(await api("GET", "/api/remises", null, cookieV));
ok("vendeur voit ses remises seulement", res.s === 200 && res.b.items.length === 2 && res.b.items.every((i) => i.declareeParNom === "P5 Vendeur"));

// ---- Isolation inter-entreprises ----
const email2 = `test.p5b.${Date.now()}@test.ci`;
await j(await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P5B ${Date.now()}` },
  admin: { nom: "B", prenom: "P5", email: email2, password: "Test1234!" },
}));
r = await api("POST", "/api/login", { email: email2, password: "Test1234!" });
const cookieB = r.headers.get("set-cookie")?.split(";")[0];
res = await j(await api("GET", `/api/caisses/${sessionId}`, null, cookieB));
ok("session autre tenant → 404", res.s === 404);
res = await j(await api("POST", `/api/remises/${remiseId}/confirmer`, {}, cookieB));
ok("remise autre tenant → 404", res.s === 404);
res = await j(await api("GET", `/api/caisses/actuelle?kiosqueId=${kid}`, null, cookieB));
ok("caisse kiosque autre tenant → erreur", res.s !== 200);

// ---- Notifications ----
res = await j(await api("GET", "/api/notifications?limit=20", null, cookieAdmin));
const notifs = res.b.notifications || res.b.items || res.b || [];
const types = Array.isArray(notifs) ? notifs.map((n) => n.type) : [];
ok("notifications caisse créées", types.includes("caisse"));

console.log(`\n=== ${passes} PASS / ${fails} FAIL ===`);
process.exit(fails ? 1 : 0);
