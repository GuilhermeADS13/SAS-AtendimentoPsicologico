import { getDb } from "./db";
import {
  notifications,
  appointments,
  patients,
  therapists,
  users,
  therapistRequests,
  assinaturas,
} from "../drizzle/schema";
import { eq, and, lt, gte, gt, isNull, inArray, asc } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { contarPacientesCobrados } from "./assinaturas";
import { precisaAvisarVencimento, situacaoDaAssinatura } from "../shared/assinatura";
import { formatarReais, valorDaCobranca } from "../shared/precos";
import { googleCalendarUrl } from "../shared/calendario";
import { detalhesDoEmail, emailComMarca, esc, primeiroNome } from "./emailLayout";

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
  // O fuso vai ESCRITO: o servidor não sabe onde o paciente está, e "às 15:00" sem
  // contexto é lido como horário local — quem está em Manaus entraria uma hora
  // atrasado.
  return `${data} às ${hora} (horário de Brasília)`;
}

/** "sex., 24/07 às 15:00" — uma linha por data na lista da consulta semanal. */
function dataCurtaComDia(d: Date): string {
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" }).format(d);
  return `${dia} ${quandoCurto(d)}`;
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
  /**
   * Consulta nova SEMANAL: todas as datas criadas junto com esta (inclusive ela).
   * Vira UM e-mail com a lista, em vez de um e-mail por semana.
   */
  serie?: Date[];
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
  // Quem RECEBE, para a saudação ("Olá, Ana!").
  const destinatario = paraPsicologa ? psicologa : row.patientFirstName;
  // Mais de uma data = consulta semanal criada de uma vez.
  const serie = (row.serie ?? []).length > 1 ? row.serie! : null;

  // Bloco de detalhes, igual em todos os avisos: é exatamente o que faltava.
  // Cada linha só aparece se o dado existir (notificação sem consulta ligada,
  // cadastro sem nome) — melhor omitir do que mostrar "undefined".
  const detalhes = detalhesDoEmail([
    [rotulo, aOutraPessoa ? esc(aOutraPessoa) : null],
    // Na série, data curta ("sex., 16/10 às 15:00") e o fuso UMA vez, no rótulo:
    // repetido em cada linha, a lista de 12 semanas virava um paredão.
    serie
      ? ["Datas (horário de Brasília)", serie.map((d) => dataCurtaComDia(d)).join("<br>")]
      : ["Quando", quando],
    ["Duração", row.duration ? `${row.duration} minutos` : null],
  ]);

  // "Adicionar ao Google Agenda": um clique põe a consulta no calendário da
  // pessoa, que passa a lembrá-la sozinho. NÃO entra no aviso de cancelamento —
  // mandar agendar o que acabou de ser cancelado seria o oposto do esperado. Nem
  // na série: o link põe UMA data só, e daria a impressão de que é só aquela.
  const agenda =
    row.scheduledAt && n.notificationType !== "appointment_cancelled" && !serie
      ? `<p style="margin:14px 0 0;font-size:14px"><a href="${googleCalendarUrl({
          titulo: aOutraPessoa ? `Consulta com ${aOutraPessoa}` : "Consulta — VozInterior",
          inicio: row.scheduledAt,
          duracaoMin: row.duration ?? 60,
          descricao: "Consulta pelo VozInterior.",
          url: link,
          uid: `apt${n.appointmentId ?? ""}@vozinterior`,
        })}" style="color:#215756;font-weight:600">+ Adicionar ao Google Agenda</a></p>`
      : "";

  // Sem prefixo "[VozInterior]" de propósito: o remetente já se identifica, e o
  // prefixo empurraria nome e horário para fora da tela no celular.
  const sufixo = [aOutraPessoa, curto].filter(Boolean).join(" — ");
  const assunto = (titulo: string) => (sufixo ? `${titulo}: ${sufixo}` : titulo);
  const p = (texto: string) => `<p style="margin:0 0 12px">${texto}</p>`;
  const montar = (titulo: string, corpo: string, botao: string, observacao?: string) =>
    emailComMarca({ nome: destinatario, titulo, corpo: `${corpo}${detalhes}${agenda}`, botao: { texto: botao, url: link }, observacao, base });
  const entrarNaSala = "No horário, entre por “Minhas Consultas” → “Entrar na sala” (o botão abre 15 minutos antes).";

  switch (n.notificationType) {
    case "appointment_reminder":
      return {
        subject: assunto("Lembrete de consulta"),
        html: montar(
          "Lembrete da sua consulta",
          p("Passando para lembrar da sua consulta."),
          paraPsicologa ? "Ver agendamentos" : "Ver minhas consultas",
          paraPsicologa ? undefined : entrarNaSala,
        ),
      };
    case "appointment_confirmation":
      return {
        subject: assunto("Presença confirmada"),
        html: montar("Presença confirmada", p("O paciente <strong>confirmou presença</strong> na consulta."), "Ver agendamentos"),
      };
    case "appointment_cancelled":
      return {
        subject: assunto("Consulta cancelada"),
        html: montar(
          "Consulta cancelada",
          p("A consulta abaixo foi <strong>cancelada</strong>."),
          paraPsicologa ? "Ver agendamentos" : "Ver minhas consultas",
          paraPsicologa ? "Se foi engano, é só agendar de novo pelo sistema." : "Se quiser remarcar, fale com a sua psicóloga pelas Mensagens.",
        ),
      };
    case "new_appointment": {
      if (paraPsicologa) {
        return {
          subject: assunto(serie ? `${serie.length} consultas agendadas` : "Consulta agendada"),
          html: montar(
            serie ? `${serie.length} consultas agendadas` : "Consulta agendada",
            p(serie ? "As consultas semanais abaixo estão na sua agenda." : "A consulta abaixo está na sua agenda."),
            "Ver agendamentos",
          ),
        };
      }
      return {
        subject: serie
          ? `${serie.length} consultas agendadas${psicologa ? ` com ${psicologa}` : ""}`
          : assunto("Consulta agendada"),
        html: montar(
          serie ? "Suas consultas foram agendadas" : "Sua consulta foi agendada",
          p(
            serie
              ? `${psicologa ? esc(psicologa) : "Sua psicóloga"} agendou ${serie.length} consultas semanais com você. Confirme sua presença no sistema.`
              : `${psicologa ? esc(psicologa) : "Sua psicóloga"} agendou uma consulta com você. Confirme sua presença no sistema.`,
          ),
          "Confirmar presença",
          entrarNaSala,
        ),
      };
    }
    default:
      return {
        subject: assunto("Notificação"),
        html: montar("Aviso sobre uma consulta", p("Você tem uma notificação sobre uma consulta."), "Abrir o VozInterior"),
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
      patientId: appointments.patientId,
      appointmentCreatedAt: appointments.createdAt,
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
    // Consulta nova: as datas criadas JUNTO com esta (a semanal) vão no mesmo e-mail.
    const serie =
      n.notificationType === "new_appointment" && row.patientId && row.appointmentCreatedAt
        ? (await consultasDoMesmoLote(db, row.patientId, row.appointmentCreatedAt)).map((c) => c.scheduledAt)
        : undefined;
    const { subject, html } = composeEmail({ ...row, serie });
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
    // Lembrete da véspera: qualquer consulta agendada que aconteça nas próximas
    // ~26h e que ainda não tenha lembrete. Duas escolhas de propósito:
    //  - Limite superior de 26h (e não 24h) cobre a folga do ciclo de 15 min:
    //    uma consulta a 24h05 não escapa entre um tick e o seguinte.
    //  - Limite inferior é `now`, não `now+24h`. Antes a janela começava em +24h,
    //    então quem marcava em cima da hora (menos de um dia) NUNCA recebia
    //    lembrete — caía abaixo do piso e sumia. Começando em `now`, esse caso é
    //    coberto (o lembrete sai logo). O dedup mais abaixo garante um só e-mail.
    const now = new Date();
    const janelaLembrete = new Date(now.getTime() + 26 * 60 * 60 * 1000);

    const upcomingAppointments = await db
      .select({
        appointment: appointments,
        patient: patients,
        therapist: therapists,
        therapistEmail: users.email,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(therapists, eq(appointments.therapistId, therapists.id))
      .innerJoin(users, eq(users.id, therapists.userId))
      .where(
        and(
          eq(appointments.status, "scheduled"),
          gte(appointments.scheduledAt, now),
          lt(appointments.scheduledAt, janelaLembrete)
        )
      );

    for (const record of upcomingAppointments) {
      // Um lembrete para CADA lado: paciente E psicóloga. Cada um tem o seu dedup
      // (por recipientType), para não repetir e-mail nem um bloquear o outro.
      const destinatarios: Array<{ tipo: "patient" | "therapist"; email: string | null }> = [
        { tipo: "patient", email: record.patient.email },
        { tipo: "therapist", email: record.therapistEmail },
      ];

      for (const { tipo, email } of destinatarios) {
        if (!email) continue;
        const jaExiste = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.appointmentId, record.appointment.id),
              eq(notifications.notificationType, "appointment_reminder"),
              eq(notifications.recipientType, tipo)
            )
          )
          .limit(1);

        if (jaExiste.length === 0) {
          await db.insert(notifications).values({
            appointmentId: record.appointment.id,
            recipientType: tipo,
            recipientEmail: email,
            notificationType: "appointment_reminder",
            status: "pending",
          });
          // Sem o e-mail no log: o log do Render guarda tudo, e endereco de
          // paciente ali e dado pessoal sem necessidade (LGPD, minimizacao).
          console.log(`[Notifications] lembrete enfileirado (${tipo}, consulta ${record.appointment.id})`);
        }
      }
    }
  } catch (error) {
    console.error("[Notifications] Error sending reminders:", error);
  }
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * As consultas criadas NO MESMO lote (a "repetir por N semanas" insere todas de
 * uma vez, com o mesmo createdAt), ainda agendadas, em ordem de data. A folga de
 * 1s é porque o Drizzle lê o createdAt sem os microssegundos do Postgres.
 */
async function consultasDoMesmoLote(db: Db, patientId: number, criadoEm: Date) {
  return db
    .select({ id: appointments.id, scheduledAt: appointments.scheduledAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.patientId, patientId),
        eq(appointments.status, "scheduled"),
        gte(appointments.createdAt, new Date(criadoEm.getTime() - 1000)),
        lt(appointments.createdAt, new Date(criadoEm.getTime() + 1000)),
      ),
    )
    .orderBy(asc(appointments.scheduledAt));
}

/**
 * Aviso de CONSULTA NOVA — agora também para o PACIENTE.
 *
 * Antes só a psicóloga recebia (e era ela mesma quem tinha acabado de agendar),
 * enquanto o paciente não ficava sabendo de nada até o lembrete da véspera. E a
 * consulta semanal gerava um e-mail POR SEMANA: até 12 de uma vez. Agora sai um
 * aviso por LOTE (para cada lado), com todas as datas.
 *
 * Só consultas futuras: registrar uma consulta que já passou não é "agendar".
 */
export async function sendTherapistAlerts() {
  const db = await getDb();
  if (!db) {
    console.warn("[Notifications] Database not available");
    return;
  }

  try {
    const agora = new Date();
    const oneDayAgo = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

    const recentes = await db
      .select({
        appointment: appointments,
        patientEmail: patients.email,
        therapistEmail: users.email,
      })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .innerJoin(therapists, eq(appointments.therapistId, therapists.id))
      .innerJoin(users, eq(therapists.userId, users.id))
      .where(
        and(
          gte(appointments.createdAt, oneDayAgo),
          eq(appointments.status, "scheduled"),
          gt(appointments.scheduledAt, agora),
        ),
      );

    // Um lote = mesmo paciente + mesmo instante de criação. O aviso fica preso à
    // PRIMEIRA data do lote; o e-mail lista as demais.
    const lotes = new Map<string, typeof recentes>();
    for (const r of recentes) {
      const chave = `${r.appointment.patientId}:${Math.floor(r.appointment.createdAt.getTime() / 1000)}`;
      lotes.set(chave, [...(lotes.get(chave) ?? []), r]);
    }

    for (const lote of Array.from(lotes.values())) {
      lote.sort((a, b) => a.appointment.scheduledAt.getTime() - b.appointment.scheduledAt.getTime());
      const primeira = lote[0];
      const ids = lote.map((r) => r.appointment.id);
      const destinatarios: Array<{ tipo: "patient" | "therapist"; email: string | null }> = [
        { tipo: "patient", email: primeira.patientEmail },
        { tipo: "therapist", email: primeira.therapistEmail },
      ];
      for (const { tipo, email } of destinatarios) {
        if (!email) continue;
        // Dedup pelo LOTE inteiro: se a primeira for cancelada antes do envio, a
        // "primeira" muda — e não pode sair um segundo aviso do mesmo lote.
        const jaExiste = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              inArray(notifications.appointmentId, ids),
              eq(notifications.notificationType, "new_appointment"),
              eq(notifications.recipientType, tipo),
            ),
          )
          .limit(1);
        if (jaExiste.length) continue;
        await db.insert(notifications).values({
          appointmentId: primeira.appointment.id,
          recipientType: tipo,
          recipientEmail: email,
          notificationType: "new_appointment",
          status: "pending",
        });
      }
    }
  } catch (error) {
    console.error("[Notifications] Error sending new-appointment alerts:", error);
  }
}

/**
 * Roda o ciclo de notificações AGORA (ex.: logo depois de agendar), sem esperar
 * os 15 min do agendador — e sem rodar dois ciclos ao mesmo tempo: as checagens
 * "já existe aviso?" não são atômicas, e dois ciclos juntos mandariam o MESMO
 * e-mail duas vezes. Se pedirem durante um ciclo, roda mais um no fim.
 */
let cicloEmCurso: Promise<void> | null = null;
let rodarDeNovo = false;
/**
 * E-mail "seu plano vence em X dias" para a psicóloga, até 3 dias antes do fim
 * do teste ou do Pix (decisão de 2026-10-26). Uma vez por vencimento: grava a
 * data avisada em `avisoEnviadoPara`; se o envio falhar, tenta no próximo ciclo.
 * Admin não paga, não recebe.
 */
export async function avisarVencimentosDePlano(agora: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const linhas = await db
    .select({
      id: assinaturas.id,
      therapistId: assinaturas.therapistId,
      testeAte: assinaturas.testeAte,
      pagoAte: assinaturas.pagoAte,
      fundador: assinaturas.fundador,
      ciclo: assinaturas.ciclo,
      avisoEnviadoPara: assinaturas.avisoEnviadoPara,
      nome: users.name,
      email: users.email,
      role: users.role,
    })
    .from(assinaturas)
    .innerJoin(therapists, eq(therapists.id, assinaturas.therapistId))
    .innerJoin(users, eq(users.id, therapists.userId));

  let enviados = 0;
  for (const l of linhas) {
    if (l.role === "admin" || !l.email || !l.therapistId) continue;
    const s = situacaoDaAssinatura(l, agora);
    if (!precisaAvisarVencimento(s, l.avisoEnviadoPara, agora) || !s.ate) continue;

    const pacientes = await contarPacientesCobrados(db, l.therapistId);
    // Sem paciente não há o que pagar (R$ 0): um e-mail pedindo Pix não faz sentido.
    if (pacientes === 0) continue;
    const valor = valorDaCobranca(pacientes, { fundador: l.fundador, ciclo: l.ciclo });
    const quando = s.diasRestantes === 0 ? "hoje" : `em ${s.diasRestantes} dia${s.diasRestantes === 1 ? "" : "s"}`;
    const oQue = s.motivo === "teste" ? "Seu teste grátis" : "Seu plano";
    const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "long" }).format(s.ate);
    const base = appUrl();
    const html = emailComMarca({
      nome: l.nome,
      titulo: `${oQue} vence ${quando}`,
      corpo: `<p>${esc(oQue)} no VozInterior vai até <strong>${esc(data)}</strong>. Para continuar agendando, atendendo por vídeo e usando a Luma, renove pelo Pix.</p>${detalhesDoEmail([
        ["Pacientes", String(pacientes)],
        ["Valor", valor === null ? "combinado" : `${esc(formatarReais(valor))} (${l.ciclo})`],
      ])}<p>Se não renovar, seus prontuários continuam abertos para leitura — só o uso novo pausa.</p>`,
      botao: { texto: "Ver meu plano e pagar", url: `${base}/assinatura` },
      observacao: "Na aba Assinatura você também escolhe o dia do mês em que o Pix vence.",
      base,
    });
    const ok = await sendEmail(l.email, `${oQue} vence ${quando} — VozInterior`, html).catch(() => false);
    if (!ok) continue;
    await db.update(assinaturas).set({ avisoEnviadoPara: s.ate }).where(eq(assinaturas.id, l.id));
    enviados++;
  }
  return enviados;
}

/**
 * E-mail para a psicóloga quando o paciente toca em "Já paguei". Ela confere no
 * banco e confirma (ou recusa) no Financeiro — o sistema não vê o Pix, que vai
 * direto para a conta dela. Melhor esforço: o aviso também aparece no menu.
 */
export async function avisarPsicologaDoPagamentoInformado(appointmentId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [l] = await db
    .select({
      price: appointments.price,
      scheduledAt: appointments.scheduledAt,
      pacienteNome: patients.firstName,
      pacienteSobrenome: patients.lastName,
      psicologaNome: users.name,
      psicologaEmail: users.email,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(therapists, eq(therapists.id, appointments.therapistId))
    .innerJoin(users, eq(users.id, therapists.userId))
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!l?.psicologaEmail) return;
  const paciente = `${l.pacienteNome} ${l.pacienteSobrenome}`.trim();
  const base = appUrl();
  const html = emailComMarca({
    nome: l.psicologaNome,
    titulo: `${paciente} informou um pagamento`,
    corpo: `<p>${esc(paciente)} avisou que pagou a consulta por Pix. Confira no seu banco se o valor caiu e confirme no Financeiro — até lá ela continua como pendente.</p>${detalhesDoEmail([
      ["Consulta", esc(formatarQuando(l.scheduledAt) ?? "")],
      ["Valor", l.price ? esc(formatarReais(l.price)) : null],
    ])}`,
    botao: { texto: "Abrir o Financeiro", url: `${base}/financeiro` },
    base,
  });
  await sendEmail(l.psicologaEmail, `${paciente} informou um pagamento — VozInterior`, html);
}

export function rodarCicloDeNotificacoes(): Promise<void> {
  if (cicloEmCurso) {
    rodarDeNovo = true;
    return cicloEmCurso;
  }
  cicloEmCurso = (async () => {
    try {
      do {
        rodarDeNovo = false;
        await sendAppointmentReminders();
        await sendTherapistAlerts();
        await sendCancellationAlerts();
        const pedidos = await notifyPendingTherapistRequests();
        const vencimentos = await avisarVencimentosDePlano();
        const result = await processPendingNotifications();
        console.log("[Notifications] ciclo:", { ...result, solicitacoes: pedidos, vencimentos });
      } while (rodarDeNovo);
    } catch (error) {
      console.error("[Notifications] erro no ciclo:", error);
    } finally {
      cicloEmCurso = null;
    }
  })();
  return cicloEmCurso;
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
