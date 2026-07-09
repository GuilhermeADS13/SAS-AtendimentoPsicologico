import { getDb } from "./db";
import { notifications, appointments, patients, therapists, users } from "../drizzle/schema";
import { eq, and, lt, gte } from "drizzle-orm";
import { sendEmail } from "./mailer";

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
