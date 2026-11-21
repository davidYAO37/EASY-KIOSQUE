/** Supprime les données de test Phase 3 (entreprises "TEST P3*" / "AUTRE P3*"). */
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const env = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
  "utf8"
);
const uri = (env.match(/^MONGO(?:DB)?_URI=(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "");
await mongoose.connect(uri, { dbName: "bdd_easy_kiosque" });
const db = mongoose.connection.db;
const coll = (n) => db.collection(n);

const ents = await coll("entreprises")
  .find({ nomSociete: { $regex: /^(TEST P|AUTRE P)\d+ / } })
  .toArray();
console.log(`Entreprises de test : ${ents.length}`);
const ids = ents.map((e) => e._id);

for (const [col, champ] of [
  ["users", "entrepriseId"], ["profils", "entrepriseId"], ["kiosques", "entrepriseId"],
  ["categories", "entrepriseId"], ["produits", "entrepriseId"], ["clients", "entrepriseId"],
  ["ventes", "entrepriseId"], ["lignesventes", "entrepriseId"], ["paiements", "entrepriseId"],
  ["creances", "entrepriseId"], ["remboursements", "entrepriseId"], ["mouvementscaisses", "entrepriseId"],
  ["notifications", "entrepriseId"], ["journauxactivite", "entrepriseId"],
  ["sessionscaisses", "entrepriseId"], ["remises", "entrepriseId"],
  ["sequences", "entrepriseId"], ["journalconnexions", "entrepriseId"],
]) {
  const r = await coll(col).deleteMany({ [champ]: { $in: ids } });
  if (r.deletedCount) console.log(`  ${col}: ${r.deletedCount} supprimé(s)`);
}
const r = await coll("entreprises").deleteMany({ _id: { $in: ids } });
console.log(`  entreprises: ${r.deletedCount} supprimée(s)`);
await mongoose.disconnect();
console.log("Nettoyage terminé.");
