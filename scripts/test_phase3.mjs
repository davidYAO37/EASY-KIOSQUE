/**
 * Test fonctionnel Phase 3 — scénario complet :
 * inscription → login → kiosque → produits (prix kiosque) → client →
 * vendeur → vente comptant (prix serveur) → idempotence → vente crédit →
 * créance → notification → annulation motivée → cloisonnement vendeur.
 * Usage : node scripts/test_phase3.mjs
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
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookies = res.headers.getSetCookie?.() || [];
  return { status: res.status, data: await J(res), cookies: setCookies };
}

function cookieDe(setCookies) {
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

// ---------- 1. Inscription + connexion admin ----------
let r = await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `TEST P3 ${ts}`, telephone: "01010101" },
  admin: { nom: "Admin", prenom: "P3", email: `p3-${ts}@test.ci`, password: "test1234" },
});
check("inscription entreprise", r.status === 201, r.data?.entrepriseId || r.data?.message);
const entrepriseId = r.data?.entrepriseId;

r = await api("POST", "/api/login", { email: `p3-${ts}@test.ci`, password: "test1234" });
check("connexion admin", r.status === 200);
const adminCk = cookieDe(r.cookies);

// ---------- 2. Kiosque + produits ----------
r = await api("POST", "/api/kiosques", { designation: "Kiosque Test" }, adminCk);
check("création kiosque", r.status === 201);
const kiosqueId = r.data?.kiosque?._id;

r = await api("POST", "/api/produits", {
  designation: "Spaghetti viande", typeProduit: "FABRIQUE", prixVente: 1000,
}, adminCk);
const prodA = r.data?.produit?._id;
check("produit FABRIQUE créé", r.status === 201, r.data?.produit?.code);

r = await api("POST", "/api/produits", {
  designation: "Eau minérale", typeProduit: "REVENTE", prixVente: 500,
  prixKiosques: [{ kiosqueId, prixVente: 600 }],
}, adminCk);
const prodB = r.data?.produit?._id;
check("produit REVENTE + surcharge kiosque", r.status === 201, r.data?.produit?.code);

// ---------- 3. Client + vendeur ----------
r = await api("POST", "/api/clients", { nom: "Kouassi", prenoms: "Jean", telephone: "070707", plafondCredit: 50000 }, adminCk);
check("création client", r.status === 201, r.data?.client?.code);
const clientId = r.data?.client?._id;

// Le profil Vendeur doit exister
r = await api("GET", "/api/profils", null, adminCk);
const profilVendeur = (r.data?.profils || []).find((p) => p.type === "vendeur");
check("profil Vendeur présent", !!profilVendeur);

r = await api("POST", "/api/utilisateurs", {
  nom: "Vendeur", prenom: "Jean", email: `vendeur-${ts}@test.ci`,
  password: "test1234", type: "vendeur", kiosqueIds: [kiosqueId],
}, adminCk);
check("création vendeur", r.status === 201, r.data?.message);

r = await api("POST", "/api/login", { email: `vendeur-${ts}@test.ci`, password: "test1234" });
check("connexion vendeur", r.status === 200);
const vendeurCk = cookieDe(r.cookies);

// ---------- 4. Vendeur : vente comptant au tarif serveur ----------
const cle = `test-${ts}-v1`;
r = await api("POST", "/api/ventes", {
  kiosqueId, typeVente: "comptant",
  lignes: [{ produitId: prodA, quantite: 2 }, { produitId: prodB, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: 2600, montantRecu: 3000 }],
  idempotencyKey: cle,
}, vendeurCk);
check("vente comptant vendeur", r.status === 201, r.data?.vente?.numeroVente || r.data?.message);
const vente1 = r.data?.vente;
// 2×1000 + 1×600 (surcharge kiosque) = 2600 attendu
check("total serveur (prix kiosque appliqué)", vente1?.montantTotal === 2600, `total=${vente1?.montantTotal}`);
check("monnaie rendue", vente1?.monnaieRendue === 400, `monnaie=${vente1?.monnaieRendue}`);
check("statut paiement paye", vente1?.statutPaiement === "paye");

// ---------- 5. Idempotence : même clé → même vente ----------
r = await api("POST", "/api/ventes", {
  kiosqueId, typeVente: "comptant",
  lignes: [{ produitId: prodA, quantite: 2 }, { produitId: prodB, quantite: 1 }],
  paiements: [{ mode: "Espèces", montant: 2600 }],
  idempotencyKey: cle,
}, vendeurCk);
check("idempotence (dupliquee)", r.data?.dupliquee === true && r.data?.vente?._id === vente1?._id);

// ---------- 6. Prix/remise envoyés par le navigateur → 400 ----------
r = await api("POST", "/api/ventes", {
  kiosqueId, typeVente: "comptant",
  lignes: [{ produitId: prodA, quantite: 1, prixUnitaire: 10, remise: 500 }],
  paiements: [{ mode: "Espèces", montant: 10 }],
  idempotencyKey: `test-${ts}-triche`,
}, vendeurCk);
check("prix/remise navigateur rejetés (strict)", r.status === 400, r.data?.message?.slice(0, 60));

// ---------- 7. Vendeur : vente à crédit → 403 (pas l'action) ----------
r = await api("POST", "/api/ventes", {
  kiosqueId, typeVente: "credit", clientId,
  lignes: [{ produitId: prodA, quantite: 1 }],
  paiements: [], idempotencyKey: `test-${ts}-v2`,
}, vendeurCk);
check("vente à crédit refusée au vendeur", r.status === 403, r.data?.message?.slice(0, 50));

// ---------- 8. Admin : vente à crédit partielle → créance ----------
r = await api("POST", "/api/ventes", {
  kiosqueId, typeVente: "credit", clientId,
  lignes: [{ produitId: prodA, quantite: 3 }],
  paiements: [{ mode: "Orange Money", montant: 1000 }],
  idempotencyKey: `test-${ts}-v3`,
}, adminCk);
check("vente à crédit admin", r.status === 201, r.data?.vente?.numeroVente || r.data?.message);
const vente2 = r.data?.vente;
check("reste à payer = 2000", vente2?.resteAPayer === 2000, `reste=${vente2?.resteAPayer}`);
check("statut paiement partiel", vente2?.statutPaiement === "partiel");

// ---------- 9. Notifications propriétaire ----------
r = await api("GET", "/api/notifications?limit=10", null, adminCk);
const ventesNotif = (r.data?.notifications || []).filter((n) => n.type === "vente");
check("notifications ventes créées", ventesNotif.length >= 2, `nonLues=${r.data?.nonLues}`);
r = await api("GET", "/api/notifications?limit=5", null, vendeurCk);
check("notifications refusées au vendeur", r.status === 403);

// ---------- 10. Vendeur : annulation → 403 ; admin avec motif → OK ----------
r = await api("POST", `/api/ventes/${vente1?._id}/annulation`, { motif: "Erreur de saisie" }, vendeurCk);
check("annulation refusée au vendeur", r.status === 403);
r = await api("POST", `/api/ventes/${vente1?._id}/annulation`, { motif: "Erreur de saisie caissière" }, adminCk);
check("annulation admin avec motif", r.status === 200, r.data?.vente?.statutVente);
check("vente annulée + motif conservé",
  r.data?.vente?.statutVente === "annulee" && !!r.data?.vente?.annulation?.motif);
r = await api("POST", `/api/ventes/${vente1?._id}/annulation`, { motif: "Encore" }, adminCk);
check("double annulation refusée", r.status === 409);

// ---------- 11. Cloisonnement : vendeur ne voit que ses ventes ----------
r = await api("GET", "/api/ventes?limit=50", null, vendeurCk);
const ventesVendeur = r.data?.ventes || [];
check("vendeur → ses ventes seulement",
  ventesVendeur.length === 1 && ventesVendeur[0]._id === vente1?._id,
  `total=${r.data?.total}`);
r = await api("GET", "/api/ventes?limit=50", null, adminCk);
check("admin → toutes les ventes", (r.data?.total || 0) === 2, `total=${r.data?.total}`);

// ---------- 12. Ticket ----------
r = await api("GET", `/api/ventes/${vente2?._id}/ticket`, null, vendeurCk);
check("ticket vendeur (sa vente → 404 attendu)", r.status === 404);
r = await api("GET", `/api/ventes/${vente2?._id}/ticket`, null, adminCk);
check("ticket admin", r.status === 200 && r.data?.ticket?.entreprise?.nom?.includes("TEST P3"),
  r.data?.ticket?.entreprise?.nom);

// ---------- 13. Isolation inter-entreprises ----------
r = await api("POST", "/api/inscription", {
  entreprise: { nomSociete: `AUTRE P3 ${ts}` },
  admin: { nom: "Autre", email: `autre-${ts}@test.ci`, password: "test1234" },
});
r = await api("POST", "/api/login", { email: `autre-${ts}@test.ci`, password: "test1234" });
const autreCk = cookieDe(r.cookies);
r = await api("GET", "/api/ventes", null, autreCk);
check("isolation ventes", r.data?.total === 0);
r = await api("GET", "/api/clients", null, autreCk);
check("isolation clients", r.data?.total === 0);
r = await api("GET", `/api/ventes/${vente1?._id}`, null, autreCk);
check("isolation détail vente (404)", r.status === 404);

console.log(`\n${KO === 0 ? "✅ Tous les tests passent" : `❌ ${KO} échec(s)`}`);
process.exit(KO ? 1 : 0);
