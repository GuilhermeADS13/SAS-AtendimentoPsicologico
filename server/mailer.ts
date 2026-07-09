import nodemailer from "nodemailer";

/**
 * Envio de e-mail via SMTP (nodemailer). Configure SMTP_* no ambiente.
 * Sem configuração, roda em modo "dry-run" (apenas loga) — útil em dev.
 */

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS implícito; 587 = STARTTLS
    auth: { user, pass },
  });
  return transporter;
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/**
 * Envia um e-mail. Retorna true se enviado de fato, false se em dry-run
 * (SMTP não configurado) — nesse caso o chamador deixa a notificação pendente.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const t = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@sas.local";

  if (!t) {
    console.log(`[Mailer] dry-run (SMTP não configurado) → para: ${to} | assunto: ${subject}`);
    return false;
  }

  await t.sendMail({ from, to, subject, html });
  return true;
}
