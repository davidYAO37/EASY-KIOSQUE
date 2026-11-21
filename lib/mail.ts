import nodemailer from "nodemailer";

/**
 * Envoi d'emails transactionnels (mot de passe oublié, bienvenue,
 * alertes d'abonnement).
 *
 * Configuration via variables d'environnement :
 *   SMTP_HOST, SMTP_PORT (465 = SSL implicite), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM (ex. "EASY-KIOSQUE <no-reply@easy-kiosque.com>")
 *
 * Sans SMTP configuré → le message est journalisé dans la console
 * serveur (mode développement) au lieu d'être envoyé.
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

export function mailConfigure(): boolean {
  return !!process.env.SMTP_HOST;
}

export async function envoyerMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ envoye: boolean }> {
  const t = getTransporter();
  const from = process.env.MAIL_FROM || "EASY-KIOSQUE <no-reply@easy-kiosque.local>";
  if (!t) {
    // Développement : le contenu est visible dans les logs serveur.
    console.log(`[MAIL DEV] À: ${opts.to} | Sujet: ${opts.subject}\n${opts.html.replace(/<[^>]+>/g, " ").slice(0, 500)}`);
    return { envoye: false };
  }
  try {
    await t.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return { envoye: true };
  } catch (e) {
    console.error("[MAIL] Échec d'envoi:", e);
    return { envoye: false };
  }
}

/** Gabarit commun des emails EASY-KIOSQUE. */
export function gabaritMail(titre: string, corps: string, lien?: { url: string; libelle: string }): string {
  const bouton = lien
    ? `<p style="text-align:center;margin:28px 0">
         <a href="${lien.url}" style="background:#0d6efd;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600">${lien.libelle}</a>
       </p>
       <p style="font-size:12px;color:#6c757d">Si le bouton ne fonctionne pas, copiez ce lien :<br/>${lien.url}</p>`
    : "";
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb">
      <div style="background:#0d6efd;color:#fff;padding:16px 24px;font-size:18px;font-weight:700">EASY-KIOSQUE</div>
      <div style="padding:24px">
        <h2 style="margin-top:0;font-size:18px;color:#212529">${titre}</h2>
        <div style="font-size:14px;color:#495057;line-height:1.6">${corps}</div>
        ${bouton}
      </div>
      <div style="padding:12px 24px;font-size:11px;color:#adb5bd;border-top:1px solid #e5e7eb">
        EASY-KIOSQUE — Gestion commerciale multi-kiosques. Cet email est automatique, merci de ne pas y répondre.
      </div>
    </div>
  </body></html>`;
}
