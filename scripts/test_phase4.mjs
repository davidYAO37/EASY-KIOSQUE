/**
 * Test fonctionnel Phase 4 — crédits clients :
 * vente à crédit → créance → remboursement partiel (FIFO) →
 * remboursement multi-ventes manuel → rejet montant > solde →
 * reçu → notification → permissions → isolation.
 * Usage : node scripts/test_phase4.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3002";
const ts = Date.now();
let KO = 0;

function check(nom, ok, info = "") {
  console.log(`${ok ? "✅" : "❌"} ${nom}${info ? " — " + info : ""}`);
  if (!ok) KO++;
}
const J = (r) => r.json().catch(() => ({}));

async function api(method, path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await J(res), cookies: res.headers.getSetCookie?.() || [] };
}
const cookieDe = (cs) => cs.map((c) => c.split(";")[0]).join("; ");

// ---------- Setup : entreprise + admin + kiosque + produit + client ----------
let r = await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P4 ${ts}` },
  admin: { nom: "Admin", email: `p4-${ts}@test.ci`, password: "test1234" },
});
check("inscription", r.status === 201);
r = await api("POST", "/api/login", { email: `p4-${ts}@test.ci`, password: "test1234" });
const adminCk = cookieDe(r.cookies);

r = await api("POST", "/api/kiosques", { designation: "K P4" }, adminCk);
const kiosqueId = r.data?.kiosque?._id;
r = await api("POST", "/api/produits", { designation: "Jus", prixVente: 500, typeProduit: "FABRIQUE" }, adminCk);
const produitId = r.data?.produit?._id;
r = await api("POST", "/api/clients", { nom: "Traoré", prenoms: "Awa", plafondCredit: 20000 }, adminCk);
const clientId = r.data?.client?._id;
check("setup complet", !!(kiosqueId && produitId && clientId));

// ---------- Deux ventes à crédit ----------
async function venteCredit(i, qte, acompte) {
  return api("POST", "/api/ventes", {
    kiosqueId, typeVente: "credit", clientId,
    lignes: [{ produitId, quantite: qte }],
    paiements: acompte ? [{ mode: "Espèces", montant: acompte }] : [],
    idempotencyKey: `p4-${ts}-v${i}`,
  }, adminCk);
}
r = await venteCredit(1, 4, 0); // 2000 dû, non payé
check("vente crédit 1 (2 000 dû)", r.status === 201 && r.data.vente.resteAPayer === 2000);
const v1 = r.data.vente;
r = await venteCredit(2, 6, 1000); // 3000 total, 1000 payé, 2000 dû
check("vente crédit 2 (2 000 dû)", r.status === 201 && r.data.vente.resteAPayer === 2000);
const v2 = r.data.vente;

// ---------- Liste des créances ----------
r = await api("GET", "/api/credits?limit=50", null, adminCk);
const mes = r.data?.creances || [];
check("2 créances listées", mes.length === 2, `totalDu=${r.data?.totalDu}`);
check("total dû global = 4000", r.data?.totalDu === 4000);
const [crA, crB] = mes.sort((a, b) => a.dateVente.localeCompare(b.dateVente));

// ---------- Remboursement partiel FIFO ----------
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 1500, mode: "Espèces",
  idempotencyKey: `p4-${ts}-r1`,
}, adminCk);
check("remboursement 1 500 (FIFO)", r.status === 201, r.data?.remboursement?.numero || r.data?.message);
const rmb1 = r.data?.remboursement;
check("ventilation sur la plus ancienne", rmb1?.allocations?.length === 1 && rmb1.allocations[0].montant === 1500);

r = await api("GET", `/api/credits/${crA._id}`, null, adminCk);
check("créance 1 → partielle (500 restant)",
  r.data?.creance?.statut === "partielle" && r.data?.creance?.solde === 500,
  `solde=${r.data?.creance?.solde}`);
check("versement visible dans le détail", (r.data?.versements || []).length === 1);

// ---------- Idempotence ----------
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 1500, mode: "Espèces",
  idempotencyKey: `p4-${ts}-r1`,
}, adminCk);
check("idempotence remboursement", r.data?.dupliquee === true);

// ---------- Rejet : montant > solde total restant (4000-1500=2500) ----------
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 9999, mode: "Espèces",
  idempotencyKey: `p4-${ts}-r2`,
}, adminCk);
check("montant > solde rejeté", r.status === 400, r.data?.code);

// ---------- Ventilation manuelle multi-ventes ----------
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 2500, mode: "Wave", reference: "WV-42",
  allocations: [
    { creanceId: crA._id, montant: 500 },
    { creanceId: crB._id, montant: 2000 },
  ],
  idempotencyKey: `p4-${ts}-r3`,
}, adminCk);
check("remboursement multi-ventes (soldé)", r.status === 201 && r.data?.remboursement?.allocations?.length === 2);

r = await api("GET", "/api/credits?statut=soldee", null, adminCk);
check("les 2 créances soldées", r.data?.total === 2);
r = await api("GET", "/api/credits?limit=50", null, adminCk);
check("total dû retombé à 0", r.data?.totalDu === 0);

// ---------- Ventilation incohérente ----------
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 100, mode: "Espèces",
  allocations: [{ creanceId: crA._id, montant: 50 }],
  idempotencyKey: `p4-${ts}-r4`,
}, adminCk);
check("ventilation incohérente rejetée", r.status === 400, r.data?.code);

// ---------- Reçu ----------
r = await api("GET", `/api/remboursements/${rmb1._id}/recu`, null, adminCk);
check("reçu remboursement", r.status === 200 && r.data?.recu?.remboursement?.numero === rmb1.numero,
  `soldeRestant=${r.data?.recu?.soldeRestantClient}`);

// ---------- Notification + historique ----------
r = await api("GET", "/api/notifications?limit=20", null, adminCk);
check("notifications remboursements",
  (r.data?.notifications || []).filter((n) => n.type === "remboursement").length === 2);

r = await api("GET", `/api/remboursements?clientId=${clientId}`, null, adminCk);
check("historique remboursements client", r.data?.total === 2);

// ---------- Permissions vendeur ----------
r = await api("POST", "/api/utilisateurs", {
  nom: "V", email: `vp4-${ts}@test.ci`, password: "test1234", type: "vendeur", kiosqueIds: [kiosqueId],
}, adminCk);
r = await api("POST", "/api/login", { email: `vp4-${ts}@test.ci`, password: "test1234" });
const vendeurCk = cookieDe(r.cookies);
r = await api("GET", "/api/credits", null, vendeurCk);
check("créances refusées au vendeur", r.status === 403);
r = await api("POST", "/api/remboursements", {
  kiosqueId, clientId, montant: 100, mode: "Espèces", idempotencyKey: `p4-${ts}-rv`,
}, vendeurCk);
check("remboursement refusé au vendeur", r.status === 403);

// ---------- Isolation ----------
r = await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `AUTRE P4 ${ts}` },
  admin: { nom: "A", email: `autrep4-${ts}@test.ci`, password: "test1234" },
});
r = await api("POST", "/api/login", { email: `autrep4-${ts}@test.ci`, password: "test1234" });
const autreCk = cookieDe(r.cookies);
r = await api("GET", "/api/credits", null, autreCk);
check("isolation créances", r.data?.total === 0);
r = await api("GET", `/api/remboursements/${rmb1._id}`, null, autreCk);
check("isolation remboursement (404)", r.status === 404);

console.log(`\n${KO === 0 ? "✅ Tous les tests passent" : `❌ ${KO} échec(s)`}`);
process.exit(KO ? 1 : 0);
