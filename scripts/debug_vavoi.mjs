import { MongoClient } from "mongodb";

const c = new MongoClient("mongodb://localhost:27017");
await c.connect();
const db = c.db("bdd_easy_kiosque");
const users = db.collection("users");

const u = await users.findOne({ email: /moise/i }) || await users.findOne({ nom: /MOISE/i });
if (!u) {
  console.log("USER INTROUVABLE — liste des comptes :");
  const all = await users.find({}, { projection: { nom: 1, prenom: 1, email: 1, type: 1, kiosqueIds: 1 } }).toArray();
  all.forEach((x) => console.log(x._id.toString(), x.type, x.prenom, x.nom, x.email, "kiosques:", (x.kiosqueIds || []).map(String)));
  await c.close();
  process.exit(0);
}

console.log("USER:", {
  id: u._id.toString(),
  nom: u.nom,
  prenom: u.prenom,
  type: u.type,
  kiosqueIds: (u.kiosqueIds || []).map(String),
  entrepriseId: u.entrepriseId?.toString(),
});

const ventes = await db.collection("ventes")
  .find({ vendeurId: u._id }, { projection: { numeroVente: 1, dateVente: 1, kiosqueId: 1, montantTotal: 1, statutVente: 1, vendeurNom: 1 } })
  .sort({ dateVente: -1 })
  .toArray();
console.log(`\nVENTES FAITES PAR LUI : ${ventes.length}`);
ventes.forEach((v) => console.log(" ", v.numeroVente, v.dateVente?.toISOString(), "kiosque:" + v.kiosqueId, v.montantTotal, v.statutVente));

const kj = await db.collection("kiosques").find({ entrepriseId: u.entrepriseId }).toArray();
console.log("\nKIOSQUES ENTREPRISE:", kj.map((k) => `${k._id} ${k.code} ${k.designation}`));

// Toutes les ventes du(s) kiosque(s) concerné(s)
const kidSet = (u.kiosqueIds?.length ? u.kiosqueIds : kj.map((k) => k._id));
const ventesK = await db.collection("ventes")
  .find({ kiosqueId: { $in: kidSet } }, { projection: { numeroVente: 1, dateVente: 1, vendeurId: 1, vendeurNom: 1, statutVente: 1 } })
  .sort({ dateVente: -1 }).limit(20).toArray();
console.log(`\nVENTES DES KIOSQUES VISIBLES (20 dernières) :`);
ventesK.forEach((v) => console.log(" ", v.numeroVente, v.dateVente?.toISOString(), v.vendeurNom, v.vendeurId?.toString() === u._id.toString() ? "<== LUI" : ""));

await c.close();
