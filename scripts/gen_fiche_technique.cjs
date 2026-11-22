// Génère C:\EasyKiosqueInstaller\Documents\fiche_technique.pdf
const fs = require("fs");
const PDFDocument = require("pdfkit");

const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream("C:/EasyKiosqueInstaller/Documents/fiche_technique.pdf"));

const NAVY = "#14213d";
const ORANGE = "#ea580c";

function titre(t) {
  doc.moveDown(0.6).font("Helvetica-Bold").fontSize(13).fillColor(NAVY).text(t);
}
function corps(t) {
  doc.font("Helvetica").fontSize(10).fillColor("#333333").text(t, { lineGap: 2 });
}

doc.rect(0, 0, 612, 90).fill(NAVY);
doc.font("Helvetica-Bold").fontSize(24).fillColor("#ffffff").text("EASY KIOSQUE", 50, 28);
doc.font("Helvetica").fontSize(11).fillColor(ORANGE).text("Fiche technique — Installation locale", 50, 58);
doc.moveDown(4);

titre("1. Présentation");
corps("EASY KIOSQUE est une solution de gestion de points de vente multi-entreprises et multi-kiosques : ventes au comptant et à crédit, caisses, remises, dépenses, crédits clients, rapports et exports. L'application fonctionne en local sur le poste du client (mode production, serveur autonome embarqué).");

titre("2. Composants installés");
corps("• Application EASY KIOSQUE (build autonome) : C:\\Program Files\\EasyKiosque\\EasyKiosque");
corps("• Runtime Node.js embarqué : node.exe (aucune installation préalable requise)");
corps("• Base de données MongoDB 8.0 : service Windows « MongoDB », port 27017");
corps("• Service applicatif Windows « EasyKiosque » : démarrage automatique, redémarrage en cas d'arrêt");

titre("3. Ports et accès");
corps("• Application : http://localhost:3002 (port 3002)");
corps("• MongoDB : 127.0.0.1:27017 — base « bdd_easy_kiosque »");
corps("• Les deux ports doivent être libres avant l'installation.");

titre("4. Emplacement des données");
corps("• Données : C:\\ProgramData\\EasyKiosque\\MongoDB\\data");
corps("• Sauvegardes : C:\\ProgramData\\EasyKiosque\\Backups");
corps("• Journaux : C:\\ProgramData\\EasyKiosque\\Logs et C:\\ProgramData\\EasyKiosque\\MongoDB\\log");
corps("• Les données sont conservées en cas de désinstallation.");

titre("5. Administration");
corps("Menu Démarrer → Easy Kiosque → Administration :");
corps("• Démarrer / Arrêter / Redémarrer / État du serveur");
corps("• Sauvegarde (mongodump) et Restauration (mongorestore) de la base");
corps("• Mise à jour : arrêt du service, copie des fichiers, redémarrage");

titre("6. Premier démarrage");
corps("Au premier démarrage, un compte super-administrateur plateforme est créé :");
corps("    superadmin@easy-kiosque.local / admin123");
corps("⚠ Changez ce mot de passe immédiatement (Mon compte → Changer le mot de passe), puis créez l'entreprise, les kiosques et les utilisateurs.");

titre("7. Prérequis");
corps("• Windows 10/11 ou Windows Server 64 bits");
corps("• Droits administrateur pour l'installation et les scripts de service");
corps("• 2 Go d'espace disque minimum, 4 Go de RAM recommandés");

doc.end();
console.log("PDF généré.");
