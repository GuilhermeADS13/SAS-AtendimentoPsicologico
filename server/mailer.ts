import nodemailer from "nodemailer";

/**
 * Envio de e-mail, com dois caminhos.
 *
 * PRODUÇÃO (Render) usa a API HTTP da Brevo. Não é preferência: o plano free do
 * Render **bloqueia as portas de SMTP** (25, 465 e 587) na saída, então qualquer
 * envio via nodemailer morre em "Connection timeout" — foi o que derrubou todos
 * os e-mails do sistema até 2026-07-15. A API da Brevo fala HTTPS na 443, que
 * passa. Ver: https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
 *
 * DESENVOLVIMENTO segue no SMTP (nodemailer): da sua máquina a porta 587 abre
 * normal, e não exige chave da Brevo para testar.
 *
 * Sem nenhum dos dois, roda em "dry-run": só loga.
 */

export type EmailProvider = "brevo" | "smtp" | "dry-run";

/** Qual caminho será usado, dado o ambiente. Brevo primeiro: é o que funciona no Render. */
export function pickProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  if (env.BREVO_API_KEY) return "brevo";
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) return "smtp";
  return "dry-run";
}

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
  return pickProvider() !== "dry-run";
}

/** Remetente. Na Brevo, este endereço precisa estar verificado, senão ela recusa. */
function remetente(): { email: string; name: string } {
  return {
    email:
      process.env.EMAIL_FROM ||
      process.env.SMTP_FROM || // nome antigo, mantido para o .env.local não quebrar
      process.env.SMTP_USER ||
      "no-reply@vozinterior.app",
    name: process.env.EMAIL_FROM_NAME || "VozInterior",
  };
}

/** Envia pela API HTTP da Brevo (porta 443 — passa pelo bloqueio do Render). */
async function sendViaBrevo(to: string, subject: string, html: string): Promise<void> {
  const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY as string,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: remetente(),
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
    // Sem timeout, uma Brevo lenta seguraria o ciclo do agendador.
    signal: AbortSignal.timeout(20_000),
  });

  if (!resposta.ok) {
    // O corpo traz o motivo real (remetente não verificado, chave inválida,
    // cota estourada). Sem ele, o errorMessage da fila fica inútil.
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Brevo ${resposta.status}: ${corpo.slice(0, 300)}`);
  }
}

/**
 * Envia um e-mail. Retorna true se enviado de fato, false se em dry-run
 * (nada configurado) — nesse caso o chamador deixa a notificação pendente.
 * Erros de envio SOBEM: quem chama registra o motivo (ex.: fila de notificações).
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const provider = pickProvider();

  if (provider === "brevo") {
    await sendViaBrevo(to, subject, html);
    return true;
  }

  if (provider === "smtp") {
    const t = getTransporter();
    if (!t) return false;
    await t.sendMail({ from: `${remetente().name} <${remetente().email}>`, to, subject, html });
    return true;
  }

  console.log(`[Mailer] dry-run (nada configurado) → para: ${to} | assunto: ${subject}`);
  return false;
}
