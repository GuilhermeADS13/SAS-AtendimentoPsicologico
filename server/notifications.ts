import { getDb } from "./db";
import {
  notifications,
  appointments,
  patients,
  therapists,
  users,
  therapistRequests,
} from "../drizzle/schema";
import { eq, and, lt, gte, isNull } from "drizzle-orm";
import { sendEmail } from "./mailer";

/**
 * Base dos links enviados por e-mail.
 *
 * `RENDER_EXTERNAL_URL` é injetada pelo Render com a URL pública do serviço e
 * acompanha o rename sozinha — por isso a URL não fica chumbada aqui. `APP_URL`
 * vem antes para o dia em que existir domínio próprio, que o Render não conhece.
 */
function appUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://localhost:3000"
  );
}

const FUSO = "America/Sao_Paulo";

/**
 * Escapa texto vindo do banco antes de interpolar no HTML do e-mail.
 * Nome de paciente é digitado por gente — não pode virar marcação.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** "quinta-feira, 24 de julho de 2026 às 15:00" — sempre no horário de Brasília. */
function formatarQuando(d: Date | null): string | null {
  if (!d) return null;
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

/** "24/07 às 15:00" — versão curta, que cabe no assunto do e-mail. */
function quandoCurto(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(d)
    .replace(", ", " às ");
}

/** Para quem vai o aviso: ADMIN_EMAIL, ou o e-mail do usuário com papel `admin`. */
async function emailDoAdmin(): Promise<string> {
  const configurado = process.env.ADMIN_EMAIL || "";
  if (configurado) return configurado;

  const db = await getDb();
  if (!db) return "";

  const admin = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  return admin[0]?.email ?? "";
}

type SolicitacaoParaAvisar = {
  id: number;
  fullName: string;
  crp: string;
  email: string | null;
};

/** Guarda o motivo da falha na própria solicitação, para ficar visível na tela. */
async function registrarErro(id: number, motivo: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(therapistRequests)
    .set({ notifyError: motivo.slice(0, 500) })
    .where(eq(therapistRequests.id, id));
}

/**
 * Manda o e-mail de uma solicitação e marca `notifiedAt`.
 * Devolve false se não deu para enviar — aí `notifiedAt` fica nulo e o próximo
 * ciclo do agendador tenta de novo.
 */
async function avisarAdmin(req: SolicitacaoParaAvisar): Promise<boolean> {
  const to = await emailDoAdmin();
  if (!to) {
    const motivo = "sem ADMIN_EMAIL nem usuário admin cadastrado";
    console.warn(`[TherapistRequest] ${motivo} — e-mail não enviado.`);
    await registrarErro(req.id, motivo);
    return false;
  }

  const base = appUrl();
  const html = `
    <p><strong>Nova solicitação de acesso como psicóloga.</strong></p>
    <ul>
      <li><strong>Nome:</strong> ${esc(req.fullName)}</li>
      <li><strong>CRP:</strong> ${esc(req.crp)}</li>
      <li><strong>E-mail:</strong> ${esc(req.email ?? "—")}</li>
    </ul>
    <p>Confira o CRP no Cadastro Nacional de Psicólogos:
      <a href="https://cadastro.cfp.org.br">cadastro.cfp.org.br</a>
    </p>
    <p>
      Depois, aprove ou recuse em
      <a href="${base}/solicitacoes">${base}/solicitacoes</a>.
    </p>
  `;

  let entregue: boolean;
  try {
    entregue = await sendEmail(
      to,
      `[VozInterior] Solicitação de acesso — ${req.fullName} (CRP ${req.crp})`,
      html,
    );
  } catch (error) {
    // O motivo real (401 da Brevo, remetente não verificado, cota) vive aqui.
    // Sem gravar, ele morreria no log do Render e o aviso pareceria só "não saiu".
    const motivo = error instanceof Error ? error.message : String(error);
    console.warn(`[TherapistRequest] falha ao enviar aviso #${req.id}:`, motivo);
    await registrarErro(req.id, motivo);
    return false;
  }

  if (!entregue) {
    await registrarErro(req.id, "e-mail não configurado (dry-run)");
    return false;
  }

  const db = await getDb();
  if (db) {
    await db
      .update(therapistRequests)
      .set({ notifiedAt: new Date(), notifyError: null })
      .where(eq(therapistRequests.id, req.id));
  }
  return true;
}

/**
 * Avisa o admin de uma solicitação recém-criada (caminho rápido).
 *
 * Falhar aqui não perde o aviso: sem `notifiedAt`, o agendador reenvia. Foi o
 * que faltou quando a solicitação da Beatriz caiu junto com um deploy — o
 * e-mail era disparado e esquecido, e ninguém ficava sabendo que falhou.
 */
export async function notifyAdminOfTherapistRequest(requestId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({
      id: therapistRequests.id,
      fullName: therapistRequests.fullName,
      crp: therapistRequests.crp,
      email: therapistRequests.email,
    })
    .from(therapistRequests)
    .where(eq(therapistRequests.id, requestId))
    .limit(1);

  if (!rows.length) return;
  await avisarAdmin(rows[0]);
}

/**
 * Rede de segurança: reenvia o aviso das solicitações pendentes que ainda não
 * foram notificadas. Roda no ciclo do agendador, a cada 15 min.
 */
export async function notifyPendingTherapistRequests(): Promise<{
  sent: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0 };

  const pendentes = await db
    .select({
      id: therapistRequests.id,
      fullName: therapistRequests.fullName,
      crp: therapistRequests.crp,
      email: therapistRequests.email,
    })
    .from(therapistRequests)
    .where(
      and(eq(therapistRequests.status, "pending"), isNull(therapistRequests.notifiedAt)),
    )
    .limit(20);

  let sent = 0;
  let failed = 0;

  for (const req of pendentes) {
    try {
      (await avisarAdmin(req)) ? sent++ : failed++;
    } catch (error) {
      failed++;
      console.warn(`[TherapistRequest] falha ao reenviar aviso #${req.id}:`, error);
    }
  }

  return { sent, failed };
}

/** Avisa quem pediu acesso profissional do resultado da análise. */
export async function notifyTherapistRequestReviewed(req: {
  email: string;
  fullName: string;
  approved: boolean;
}): Promise<void> {
  if (!req.email) return;

  const base = appUrl();
  const primeiroNome = req.fullName.trim().split(/\s+/)[0];

  const html = req.approved
    ? `<p>Olá, ${primeiroNome}!</p>
       <p>Seu <strong>acesso profissional foi aprovado</strong>. Entre em
         <a href="${base}/login">${base}</a> — sua área clínica já está liberada.</p>
       <p>Se você já estava com o site aberto, saia e entre de novo para o acesso valer.</p>`
    : `<p>Olá, ${primeiroNome}.</p>
       <p>Sua solicitação de acesso profissional <strong>não foi aprovada</strong>.
         Sua conta continua ativa como paciente.</p>
       <p>Se acredita que houve um engano, responda este e-mail.</p>`;

  await sendEmail(
    req.email,
    req.approved
      ? "[VozInterior] Seu acesso profissional foi aprovado"
      : "[VozInterior] Sobre sua solicitação de acesso profissional",
    html,
  );
}

type NotificationRow = typeof notifications.$inferSelect;

/** A notificação junto com os dados da consulta que ela cita. */
type NotificacaoComContexto = {
  n: NotificationRow;
  scheduledAt: Date | null;
  duration: number | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  therapistName: string | null;
};

/**
 * Monta assunto + corpo do e-mail.
 *
 * Antes dizia só "Uma consulta foi cancelada", e ninguém sabia QUAL. Agora leva
 * o nome da outra pessoa e a data/hora — inclusive no assunto, que é o que
 * aparece na lista da caixa de entrada, muitas vezes a única coisa que se lê.
 *
 * Cada lado quer um nome diferente: a psicóloga precisa saber de qual paciente
 * se trata; o paciente, com qual psicóloga é a consulta.
 */
export function composeEmail(row: NotificacaoComContexto): { subject: string; html: string } {
  const { n } = row;
  const paraPsicologa = n.recipientType === "therapist";
  const base = appUrl();

  const paciente = [row.patientFirstName, row.patientLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const psicologa = (row.therapistName ?? "").trim();
  const quando = formatarQuando(row.scheduledAt);
  const curto = quandoCurto(row.scheduledAt);

  const aOutraPessoa = paraPsicologa ? paciente : psicologa;
  const rotulo = paraPsicologa ? "Paciente" : "Psicóloga";
  const link = paraPsicologa ? `${base}/appointments` : `${base}/consultas`;

  // Bloco de detalhes, igual em todos os avisos: é exatamente o que faltava.
  // Cada linha só aparece se o dado existir (notificação sem consulta ligada,
  // cadastro sem nome) — melhor omitir do que mostrar "undefined".
  const detalhes = `
    <ul>
      ${aOutraPessoa ? `<li><strong>${rotulo}:</strong> ${esc(aOutraPessoa)}</li>` : ""}
      ${quando ? `<li><strong>Quando:</strong> ${quando}</li>` : ""}
      ${row.duration ? `<li><strong>Duração:</strong> ${row.duration} minutos</li>` : ""}
    </ul>
    <p><a href="${link}">Ver no VozInterior</a></p>
  `;

  // Sem prefixo "[VozInterior]" de propósito: o remetente já se identifica, e o
  // prefixo empurraria nome e horário para fora da tela no celular.
  const sufixo = [aOutraPessoa, curto].filter(Boolean).join(" — ");
  const assunto = (titulo: string) => (sufixo ? `${titulo}: ${sufixo}` : titulo);

  switch (n.notificationType) {
    case "appointment_reminder":
      return {
        subject: assunto("Lembrete de consulta"),
        // Os nomes ficam só no bloco de detalhes: repeti-los na frase deixava o
        // e-mail dizendo o mesmo nome duas vezes, com duas linhas de distância.
        html: `<p>Olá!</p>
          <p>Passando para lembrar da sua consulta.</p>
          ${detalhes}`,
      };
    case "appointment_confirmation":
      return {
        subject: assunto("Presença confirmada"),
        html: `<p>O paciente <strong>confirmou presença</strong> na consulta.</p>
          ${detalhes}`,
      };
    case "appointment_cancelled":
      return {
        subject: assunto("Consulta cancelada"),
        html: `<p>A consulta abaixo foi <strong>cancelada</strong>.</p>
          ${detalhes}
          <p>Se foi engano, é só agendar de novo pelo sistema.</p>`,
      };
    case "new_appointment":
      return {
        subject: assunto("Nova consulta agendada"),
        html: `<p>Uma nova consulta foi agendada.</p>
          ${detalhes}`,
      };
    default:
      return {
        subject: assunto("Notificação"),
        html: `<p>Você tem uma notificação sobre uma consulta.</p>${detalhes}`,
      };
  }
}

/**
 * Processa a fila de notificações pendentes: envia o e-mail e marca o status.
 * Se o SMTP não estiver configurado (dry-run), deixa como pendente.
 */
export async function processPendingNotifications(
  limit = 50,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0, skipped: 0 };

  // Traz a consulta (e os nomes dos dois lados) junto da notificação: sem isso o
  // e-mail não teria como dizer de qual consulta está falando. leftJoin porque
  // uma notificação pode não estar ligada a nenhuma consulta.
  const pending = await db
    .select({
      n: notifications,
      scheduledAt: appointments.scheduledAt,
      duration: appointments.duration,
      patientFirstName: patients.firstName,
      patientLastName: patients.lastName,
      therapistName: users.name,
    })
    .from(notifications)
    .leftJoin(appointments, eq(appointments.id, notifications.appointmentId))
    .leftJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(therapists, eq(therapists.id, appointments.therapistId))
    .leftJoin(users, eq(users.id, therapists.userId))
    .where(eq(notifications.status, "pending"))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of pending) {
    const n = row.n;
    const { subject, html } = composeEmail(row);
    try {
      const delivered = await sendEmail(n.recipientEmail, subject, html);
      if (delivered) {
        await db
          .update(notifications)
          .set({ status: "sent", sentAt: new Date() })
          .where(eq(notifications.id, n.id));
        sent++;
      } else {
        // SMTP não configurado → mantém pendente para reenviar quando configurar.
        skipped++;
      }
    } catch (error) {
      await db
        .update(notifications)
        .set({ status: "failed", errorMessage: String(error) })
        .where(eq(notifications.id, n.id));
      failed++;
    }
  }

  return { sent, failed, skipped };
}

/**
 * Enviar lembretes automáticos para pacientes
 * Deve ser executado periodicamente (ex: a cada hora)
 */
export async function sendAppointmentReminders() {
  const db = await getDb();
  if (!db) {
    console.warn("[Notifications] Database not available");
    return;
  }

  try {
    // Buscar agendamentos para os próximos dias que ainda não tiveram lembrete enviado
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const upcomingAppointments = await db
      .select({
        appointment: appointments,
        patient: patients,
        therapist: therapists,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(therapists, eq(appointments.therapistId, therapists.id))
      .where(
        and(
          eq(appointments.status, "scheduled"),
          gte(appointments.scheduledAt, tomorrow),
          lt(appointments.scheduledAt, threeDaysFromNow)
        )
      );

    for (const record of upcomingAppointments) {
      // Verificar se já foi enviado um lembrete
      const existingNotification = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.appointmentId, record.appointment.id),
            eq(notifications.notificationType, "appointment_reminder"),
            eq(notifications.recipientType, "patient")
          )
        )
        .limit(1);

      if (existingNotification.length === 0) {
        // Criar notificação pendente
        await db.insert(notifications).values({
          appointmentId: record.appointment.id,
          recipientType: "patient",
          recipientEmail: record.patient.email,
          notificationType: "appointment_reminder",
          status: "pending",
        });

        console.log(
          `[Notifications] Reminder queued for patient ${record.patient.email}`
        );
      }
    }
  } catch (error) {
    console.error("[Notifications] Error sending reminders:", error);
  }
}

/**
 * Enviar alertas para psicóloga sobre novos agendamentos
 */
export async function sendTherapistAlerts() {
  const db = await getDb();
  if (!db) {
    console.warn("[Notifications] Database not available");
    return;
  }

  try {
    // Buscar agendamentos criados nas últimas 24 horas sem notificação enviada
    const oneDayAgo = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

    const recentAppointments = await db
      .select({
        appointment: appointments,
        patient: patients,
        therapist: therapists,
        therapistUser: users,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(therapists, eq(appointments.therapistId, therapists.id))
      .innerJoin(users, eq(therapists.userId, users.id))
      .where(
        and(
          gte(appointments.createdAt, oneDayAgo),
          eq(appointments.status, "scheduled")
        )
      );

    for (const record of recentAppointments) {
      // Verificar se já foi enviado um alerta
      const existingNotification = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.appointmentId, record.appointment.id),
            eq(notifications.notificationType, "new_appointment"),
            eq(notifications.recipientType, "therapist")
          )
        )
        .limit(1);

      if (existingNotification.length === 0 && record.therapistUser.email) {
        // Criar notificação pendente para psicóloga
        await db.insert(notifications).values({
          appointmentId: record.appointment.id,
          recipientType: "therapist",
          recipientEmail: record.therapistUser.email,
          notificationType: "new_appointment",
          status: "pending",
        });

        console.log(
          `[Notifications] Alert queued for therapist ${record.therapistUser.email}`
        );
      }
    }
  } catch (error) {
    console.error("[Notifications] Error sending therapist alerts:", error);
  }
}

/**
 * Enviar alertas sobre cancelamentos
 */
export async function sendCancellationAlerts() {
  const db = await getDb();
  if (!db) {
    console.warn("[Notifications] Database not available");
    return;
  }

  try {
    // Buscar agendamentos cancelados nas últimas 24 horas sem notificação enviada
    const oneDayAgo = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

    const cancelledAppointments = await db
      .select({
        appointment: appointments,
        patient: patients,
        therapist: therapists,
        therapistUser: users,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(therapists, eq(appointments.therapistId, therapists.id))
      .innerJoin(users, eq(therapists.userId, users.id))
      .where(
        and(
          gte(appointments.updatedAt, oneDayAgo),
          eq(appointments.status, "cancelled")
        )
      );

    for (const record of cancelledAppointments) {
      // Enviar para paciente
      const patientNotification = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.appointmentId, record.appointment.id),
            eq(notifications.notificationType, "appointment_cancelled"),
            eq(notifications.recipientType, "patient")
          )
        )
        .limit(1);

      if (patientNotification.length === 0) {
        await db.insert(notifications).values({
          appointmentId: record.appointment.id,
          recipientType: "patient",
          recipientEmail: record.patient.email,
          notificationType: "appointment_cancelled",
          status: "pending",
        });
      }

      // Enviar para psicóloga
      if (record.therapistUser.email) {
        const therapistNotification = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.appointmentId, record.appointment.id),
              eq(notifications.notificationType, "appointment_cancelled"),
              eq(notifications.recipientType, "therapist")
            )
          )
          .limit(1);

        if (therapistNotification.length === 0) {
          await db.insert(notifications).values({
            appointmentId: record.appointment.id,
            recipientType: "therapist",
            recipientEmail: record.therapistUser.email,
            notificationType: "appointment_cancelled",
            status: "pending",
          });
        }
      }
    }
  } catch (error) {
    console.error("[Notifications] Error sending cancellation alerts:", error);
  }
}
