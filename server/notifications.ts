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

/**
 * Manda o e-mail de uma solicitação e marca `notifiedAt`.
 * Devolve false se não deu para enviar — aí `notifiedAt` fica nulo e o próximo
 * ciclo do agendador tenta de novo.
 */
async function avisarAdmin(req: SolicitacaoParaAvisar): Promise<boolean> {
  const to = await emailDoAdmin();
  if (!to) {
    console.warn("[TherapistRequest] sem ADMIN_EMAIL nem admin cadastrado — e-mail não enviado.");
    return false;
  }

  const base = appUrl();
  const html = `
    <p><strong>Nova solicitação de acesso como psicóloga.</strong></p>
    <ul>
      <li><strong>Nome:</strong> ${req.fullName}</li>
      <li><strong>CRP:</strong> ${req.crp}</li>
      <li><strong>E-mail:</strong> ${req.email ?? "—"}</li>
    </ul>
    <p>Confira o CRP no Cadastro Nacional de Psicólogos:
      <a href="https://cadastro.cfp.org.br">cadastro.cfp.org.br</a>
    </p>
    <p>
      Depois, aprove ou recuse em
      <a href="${base}/solicitacoes">${base}/solicitacoes</a>.
    </p>
  `;

  const entregue = await sendEmail(
    to,
    `[VozInterior] Solicitação de acesso — ${req.fullName} (CRP ${req.crp})`,
    html,
  );

  if (!entregue) return false;

  const db = await getDb();
  if (db) {
    await db
      .update(therapistRequests)
      .set({ notifiedAt: new Date() })
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

// Monta assunto + corpo HTML conforme o tipo da notificação.
function composeEmail(n: NotificationRow): { subject: string; html: string } {
  switch (n.notificationType) {
    case "appointment_reminder":
      return {
        subject: "Lembrete de consulta",
        html: `<p>Olá,</p><p>Este é um lembrete da sua consulta agendada. Nos vemos em breve!</p>`,
      };
    case "appointment_confirmation":
      return {
        subject: "Confirmação de consulta",
        html: `<p>Sua consulta foi confirmada.</p>`,
      };
    case "appointment_cancelled":
      return {
        subject: "Consulta cancelada",
        html: `<p>Uma consulta foi cancelada.</p>`,
      };
    case "new_appointment":
      return {
        subject: "Novo agendamento",
        html: `<p>Um novo agendamento foi criado.</p>`,
      };
    default:
      return { subject: "Notificação", html: `<p>Você tem uma notificação.</p>` };
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

  const pending = await db
    .select()
    .from(notifications)
    .where(eq(notifications.status, "pending"))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    const { subject, html } = composeEmail(n);
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
