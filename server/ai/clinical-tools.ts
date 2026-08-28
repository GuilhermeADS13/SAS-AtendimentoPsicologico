import { tool } from "langchain";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { aiConversations, aiMessages, appointments, documents, patients, sessions, therapists } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AiAccessContext } from "./access";
import { embeddingForCurrentEnvironment, formatRagContext, retrieveScopedClinicalContext, type RagSource } from "./rag";
import { searchIndexedDocumentChunks } from "./document-ingestion";
import { wrapUntrustedClinicalContext } from "./content-safety";
import { consumePendingAction, issuePendingAction, type PendingActionParams } from "./action-confirmation";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function resolveAiAccessContext(
  db: Db,
  user: { id: number; role: AiAccessContext["role"] },
): Promise<AiAccessContext> {
  if (user.role === "admin") {
    return { userId: user.id, role: user.role };
  }
  if (user.role === "therapist") {
    const therapistRows = await db.select({ id: therapists.id }).from(therapists)
      .where(eq(therapists.userId, user.id)).limit(1);
    return { userId: user.id, role: user.role, therapistId: therapistRows[0]?.id ?? null };
  }
  const patientRows = await db.select({ id: patients.id }).from(patients)
    .where(eq(patients.userId, user.id)).limit(1);
  return { userId: user.id, role: user.role, patientId: patientRows[0]?.id ?? null };
}

async function authorizedPatient(
  db: Db,
  ctx: AiAccessContext,
  requestedPatientId?: number,
) {
  if (ctx.role === "admin") throw new Error("Administrador não possui acesso clínico pelo agente");

  if (ctx.role === "therapist") {
    if (requestedPatientId == null || ctx.therapistId == null) {
      throw new Error("A ferramenta exige patientId para terapeuta");
    }
    const rows = await db.select().from(patients).where(
      and(eq(patients.id, requestedPatientId), eq(patients.therapistId, ctx.therapistId)),
    ).limit(1);
    if (!rows.length) throw new Error("Paciente não pertence à terapeuta autenticada");
    return rows[0];
  }

  const rows = await db.select().from(patients).where(eq(patients.userId, ctx.userId)).limit(1);
  if (!rows.length) throw new Error("Paciente autenticado não encontrado");
  if (requestedPatientId != null && requestedPatientId !== rows[0].id) {
    throw new Error("Paciente não autorizado");
  }
  return rows[0];
}

// Brasil não tem horário de verão desde 2019: um horário sem fuso é America/Sao_Paulo (-03:00).
function parseHorarioSP(raw: string): Date | null {
  const s = raw.trim();
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtSP(d: Date, full = true): string {
  return d.toLocaleString("pt-BR", full
    ? { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" }
    : { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

/** Devolve o horário conflitante (não cancelado) da terapeuta, ou null. Ignora `ignorarId`. */
export async function horarioEmConflito(
  db: Db, therapistId: number, inicio: Date, durationMin: number, ignorarId?: number,
): Promise<Date | null> {
  const janelaMs = 8 * 60 * 60 * 1000; // cobre a duração máxima (480 min)
  const candidatas = await db.select({ id: appointments.id, scheduledAt: appointments.scheduledAt, duration: appointments.duration })
    .from(appointments)
    .where(and(
      eq(appointments.therapistId, therapistId),
      ne(appointments.status, "cancelled"),
      gte(appointments.scheduledAt, new Date(inicio.getTime() - janelaMs)),
      lte(appointments.scheduledAt, new Date(inicio.getTime() + durationMin * 60_000)),
    ));
  const ini = inicio.getTime();
  const fim = ini + durationMin * 60_000;
  for (const a of candidatas) {
    if (ignorarId != null && a.id === ignorarId) continue;
    const s = a.scheduledAt.getTime();
    const e = s + (a.duration ?? 60) * 60_000;
    if (ini < e && s < fim) return a.scheduledAt;
  }
  return null;
}

/** Consulta que pertence à terapeuta autenticada (e, se informado, ao paciente no escopo). */
async function findOwnedAppointment(
  db: Db, ctx: AiAccessContext, appointmentId: number, requestedPatientId?: number,
): Promise<{ appt?: typeof appointments.$inferSelect; error?: string }> {
  if (ctx.role !== "therapist" || ctx.therapistId == null) {
    return { error: "Esta ação está disponível apenas para a terapeuta autenticada." };
  }
  const rows = await db.select().from(appointments)
    .where(and(eq(appointments.id, appointmentId), eq(appointments.therapistId, ctx.therapistId))).limit(1);
  if (!rows.length) {
    return { error: `Não encontrei a consulta #${appointmentId} na sua agenda. Confira o número com get_patient_appointments.` };
  }
  if (requestedPatientId != null && rows[0].patientId !== requestedPatientId) {
    return { error: "Essa consulta é de outro paciente. Selecione o paciente correto antes de alterar." };
  }
  return { appt: rows[0] };
}

/** Nome de exibição do paciente no escopo. Não lança: retorna undefined se não autorizado. */
export async function getScopedPatientName(db: Db, ctx: AiAccessContext, patientId?: number): Promise<string | undefined> {
  try {
    const p = await authorizedPatient(db, ctx, patientId);
    const nome = `${p.firstName} ${p.lastName}`.trim();
    return nome || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Memória curta: resume as últimas trocas de conversas ANTERIORES da terapeuta com
 * a Luma sobre este paciente (exclui a conversa atual). Serve de contexto/RAG para
 * dar continuidade. Limitado (~1200 chars) para não estourar o orçamento de tokens.
 * Só terapeuta e só o próprio escopo (userId+therapistId+patientId) — LGPD.
 */
export async function fetchConversationMemory(
  ctx: AiAccessContext, patientId: number | undefined, db: Db, excludeConversationId?: number,
): Promise<string> {
  if (ctx.role !== "therapist" || ctx.therapistId == null || patientId == null) return "";
  const conds = [
    eq(aiConversations.userId, ctx.userId),
    eq(aiConversations.therapistId, ctx.therapistId),
    eq(aiConversations.patientId, patientId),
  ];
  if (excludeConversationId != null) conds.push(ne(aiConversations.id, excludeConversationId));
  const convs = await db.select({ id: aiConversations.id }).from(aiConversations)
    .where(and(...conds)).orderBy(desc(aiConversations.updatedAt)).limit(3);
  if (!convs.length) return "";
  const rows = await db.select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages).where(inArray(aiMessages.conversationId, convs.map(c => c.id)))
    .orderBy(desc(aiMessages.createdAt)).limit(8);
  if (!rows.length) return "";
  let out = "";
  for (const m of rows.reverse()) { // do mais antigo ao mais novo
    const quem = m.role === "assistant" ? "Luma" : "Terapeuta";
    const linha = `${quem}: ${m.content.replace(/\s+/g, " ").trim().slice(0, 240)}\n`;
    if (out.length + linha.length > 1200) break;
    out += linha;
  }
  return out.trim();
}

export async function readPatientAppointments(
  ctx: AiAccessContext,
  requestedPatientId?: number,
  dbOverride?: Db,
) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const patient = await authorizedPatient(db, ctx, requestedPatientId);
  return db.select({
    id: appointments.id,
    scheduledAt: appointments.scheduledAt,
    duration: appointments.duration,
    status: appointments.status,
    confirmedAt: appointments.confirmedAt,
  }).from(appointments)
    .where(and(eq(appointments.patientId, patient.id), eq(appointments.therapistId, patient.therapistId)))
    .orderBy(desc(appointments.scheduledAt)).limit(20);
}

export async function readPatientSessions(
  ctx: AiAccessContext,
  requestedPatientId?: number,
  dbOverride?: Db,
) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const patient = await authorizedPatient(db, ctx, requestedPatientId);
  return db.select({
    id: sessions.id,
    appointmentId: sessions.appointmentId,
    startedAt: sessions.startedAt,
    endedAt: sessions.endedAt,
    mood: sessions.mood,
    clinicalNotes: sessions.clinicalNotes,
    treatment: sessions.treatment,
    nextSteps: sessions.nextSteps,
  }).from(sessions)
    .where(and(eq(sessions.patientId, patient.id), eq(sessions.therapistId, patient.therapistId)))
    .orderBy(desc(sessions.startedAt)).limit(20);
}

export async function readPatientDocuments(
  ctx: AiAccessContext,
  requestedPatientId?: number,
  dbOverride?: Db,
) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const patient = await authorizedPatient(db, ctx, requestedPatientId);
  return db.select({
    id: documents.id,
    fileName: documents.fileName,
    fileType: documents.fileType,
    documentType: documents.documentType,
    description: documents.description,
    createdAt: documents.createdAt,
  }).from(documents)
    .where(and(eq(documents.patientId, patient.id), eq(documents.therapistId, patient.therapistId)))
    .orderBy(desc(documents.createdAt)).limit(50);
}

export type AiSourceReference = Pick<RagSource, "sourceType" | "sourceId" | "patientId" | "requiresReview">;

/** Verificação barata para evitar embeddings quando o escopo não possui registros. */
export async function hasAuthorizedClinicalData(
  ctx: AiAccessContext,
  requestedPatientId: number | undefined,
  db: Db,
): Promise<boolean> {
  if (ctx.role === "admin") return false;
  const patient = await authorizedPatient(db, ctx, requestedPatientId);
  const [appointmentRows, sessionRows, documentRows] = await Promise.all([
    db.select({ id: appointments.id }).from(appointments)
      .where(and(eq(appointments.patientId, patient.id), eq(appointments.therapistId, patient.therapistId))).limit(1),
    db.select({ id: sessions.id }).from(sessions)
      .where(and(eq(sessions.patientId, patient.id), eq(sessions.therapistId, patient.therapistId))).limit(1),
    db.select({ id: documents.id }).from(documents)
      .where(and(eq(documents.patientId, patient.id), eq(documents.therapistId, patient.therapistId))).limit(1),
  ]);
  return appointmentRows.length > 0 || sessionRows.length > 0 || documentRows.length > 0;
}

/**
 * Execução das ações de escrita na agenda.
 *
 * Fica separada da definição das ferramentas porque há DOIS caminhos até aqui:
 * a própria Luma devolvendo o código numa mensagem seguinte, e o botão de
 * confirmação que a terapeuta clica na interface (routers.ts → ai.confirmAction),
 * que não passa pelo modelo. Como o segundo caminho entra direto, cada ação
 * revalida a autorização aqui — nunca confia no que veio guardado na proposta.
 */

const numeroParam = (params: PendingActionParams, chave: string): number => {
  const valor = Number(params[chave]);
  if (!Number.isFinite(valor)) throw new Error(`Parâmetro "${chave}" inválido na ação confirmada`);
  return valor;
};

const textoParam = (params: PendingActionParams, chave: string): string => String(params[chave] ?? "");

async function executarAgendamento(db: Db, ctx: AiAccessContext, params: PendingActionParams): Promise<string> {
  const patient = await authorizedPatient(db, ctx, numeroParam(params, "patientId"));
  const inicio = new Date(textoParam(params, "scheduledAt"));
  if (Number.isNaN(inicio.getTime())) throw new Error("Data da ação confirmada é inválida");
  const duration = numeroParam(params, "duration");
  const semanas = numeroParam(params, "semanas");
  const notes = textoParam(params, "notes").trim() || null;
  const nome = `${patient.firstName} ${patient.lastName}`.trim();
  const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

  // Conflitos recalculados no momento da execução: a agenda pode ter mudado
  // entre a proposta e a confirmação.
  const livres: Date[] = [];
  let emConflito = 0;
  for (let i = 0; i < semanas; i++) {
    const slot = new Date(inicio.getTime() + i * SEMANA_MS);
    if (await horarioEmConflito(db, patient.therapistId, slot, duration)) emConflito++;
    else livres.push(slot);
  }
  if (!livres.length) return "Nenhuma consulta agendada: todos os horários já estão ocupados. Sugira outro horário à terapeuta.";

  const criadas = await db.insert(appointments).values(livres.map(slot => ({
    therapistId: patient.therapistId,
    patientId: patient.id,
    scheduledAt: slot,
    duration,
    notes,
    roomToken: nanoid(16),
  }))).returning({ id: appointments.id });
  const puladas = emConflito ? ` ${emConflito} pulada(s) por conflito.` : "";
  return `AGENDADO: ${criadas.length} consulta(s) para ${nome} (${duration} min), começando ${fmtSP(inicio)}.${puladas} Os avisos serão enviados automaticamente.`;
}

async function executarRemarcacao(db: Db, ctx: AiAccessContext, params: PendingActionParams): Promise<string> {
  const appointmentId = numeroParam(params, "appointmentId");
  const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId);
  if (error || !appt) return error ?? "Consulta não encontrada.";
  if (appt.status === "cancelled") return `A consulta #${appointmentId} está cancelada; agende uma nova em vez de remarcar.`;
  const when = new Date(textoParam(params, "novoHorario"));
  if (Number.isNaN(when.getTime())) throw new Error("Data da ação confirmada é inválida");
  const duration = numeroParam(params, "duration");
  const conflito = await horarioEmConflito(db, appt.therapistId, when, duration, appt.id);
  if (conflito) return `CONFLITO DE HORÁRIO: já existe uma consulta às ${fmtSP(conflito, false)}. Não remarquei. Sugira outro horário.`;
  await db.update(appointments).set({ scheduledAt: when, duration })
    .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
  return `REMARCADA: consulta #${appointmentId} agora em ${fmtSP(when)}, ${duration} min.`;
}

async function executarCancelamento(db: Db, ctx: AiAccessContext, params: PendingActionParams): Promise<string> {
  const appointmentId = numeroParam(params, "appointmentId");
  const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId);
  if (error || !appt) return error ?? "Consulta não encontrada.";
  if (appt.status === "cancelled") return `A consulta #${appointmentId} já está cancelada.`;
  await db.update(appointments).set({ status: "cancelled" })
    .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
  return `CANCELADA: consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)}. O aviso de cancelamento será enviado automaticamente.`;
}

async function executarRegistroPagamento(db: Db, ctx: AiAccessContext, params: PendingActionParams): Promise<string> {
  const appointmentId = numeroParam(params, "appointmentId");
  const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId);
  if (error || !appt) return error ?? "Consulta não encontrada.";
  const marcarPago = params.pago !== false;
  await db.update(appointments).set({ paid: marcarPago, paidAt: marcarPago ? new Date() : null })
    .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
  return `Consulta #${appointmentId} marcada como ${marcarPago ? "paga" : "pendente"}.`;
}

/** Ponto único de escrita na agenda. Só chegam aqui ações já confirmadas. */
export async function executarAcaoAgenda(
  db: Db,
  ctx: AiAccessContext,
  toolName: string,
  params: PendingActionParams,
): Promise<string> {
  if (ctx.role !== "therapist" || ctx.therapistId == null) {
    throw new Error("Apenas a terapeuta autenticada pode alterar a agenda");
  }
  switch (toolName) {
    case "agendar_consulta": return executarAgendamento(db, ctx, params);
    case "remarcar_consulta": return executarRemarcacao(db, ctx, params);
    case "cancelar_consulta": return executarCancelamento(db, ctx, params);
    case "registrar_pagamento": return executarRegistroPagamento(db, ctx, params);
    default: throw new Error(`Ação de agenda desconhecida: ${toolName}`);
  }
}

export function createClinicalTools(
  ctx: AiAccessContext,
  db: Db,
  onSources?: (sources: AiSourceReference[]) => void,
  /** Rodada de conversa atual; muda a cada mensagem nova da terapeuta. Ver action-confirmation.ts. */
  turnKey = "",
  /** Entrega a ação pendente à interface, que renderiza o botão de confirmação. */
  onPendingAction?: (pending: { code: string; toolName: string; resumo: string }) => void,
) {
  const patientIdSchema = z.object({ patientId: z.number().int().positive().optional() });

  const codigoConfirmacaoSchema = z.string().trim().min(8).max(64).optional()
    .describe("Código devolvido pela PRÓPRIA ferramenta na chamada de proposta. Preencha somente DEPOIS que a terapeuta responder 'sim'; nunca invente um valor.");

  /**
   * Trava única das 4 ferramentas de escrita. A primeira chamada não executa:
   * registra a ação no servidor, avisa a interface (que mostra o botão de
   * confirmação) e devolve um código. A execução só acontece com o código de
   * volta — pelo botão da terapeuta ou por uma mensagem seguinte dela.
   */
  const confirmarOuPropor = (
    toolName: string,
    therapistId: number,
    params: PendingActionParams,
    codigo: string | undefined,
    resumo: string,
  ): { ok: true } | { ok: false; reply: string } => {
    const request = { therapistId, turnKey, toolName, params };
    if (!codigo?.trim()) {
      const code = issuePendingAction({ ...request, resumo });
      onPendingAction?.({ code, toolName, resumo });
      return {
        ok: false,
        reply: `AINDA NÃO EXECUTADO. ${resumo} A terapeuta já está vendo um botão de confirmação na tela — peça que ela confirme por ali. Se ela preferir responder por texto, aguarde o "sim" e só então chame ${toolName} de novo com codigoConfirmacao="${code}".`,
      };
    }
    const result = consumePendingAction(codigo, request);
    return result.ok ? { ok: true } : { ok: false, reply: `NÃO EXECUTADO. ${result.message}` };
  };

  // Ferramentas de ESCRITA, só para terapeuta. TODAS passam pelo mesmo protocolo:
  // propõem, esperam a confirmação e só então chamam executarAcaoAgenda — o
  // único ponto do módulo que escreve na agenda. Nenhuma toca em prontuário,
  // sessão ou documento (esses seguem somente leitura).
  const schedulingTools = ctx.role === "therapist" ? [
    // AGENDAR (com recorrência semanal opcional)
    tool(async ({ patientId, scheduledAt, durationMinutes, notes, repetirSemanas, codigoConfirmacao }) => {
      const patient = await authorizedPatient(db, ctx, patientId);
      const when = parseHorarioSP(scheduledAt);
      if (!when) return "Data/hora inválida. Peça à terapeuta a data e a hora exatas (ex.: 25/08/2026 às 14:00).";
      if (when.getTime() < Date.now()) return "Esse horário já passou. Confirme uma data e hora futuras antes de agendar.";
      const duration = durationMinutes && durationMinutes > 0 ? Math.min(durationMinutes, 480) : 60;
      const semanas = repetirSemanas && repetirSemanas > 0 ? Math.min(repetirSemanas, 12) : 1;
      const nome = `${patient.firstName} ${patient.lastName}`.trim();
      const params = {
        patientId: patient.id,
        scheduledAt: when.toISOString(),
        duration,
        semanas,
        notes: notes?.trim() || "",
      };

      // Conflitos aqui servem só para enriquecer o resumo que a terapeuta lê; a
      // checagem que vale é refeita na execução, com a agenda do momento.
      const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
      let emConflito = 0;
      for (let i = 0; i < semanas; i++) {
        if (await horarioEmConflito(db, patient.therapistId, new Date(when.getTime() + i * SEMANA_MS), duration)) emConflito++;
      }
      if (emConflito === semanas) return `Todos os horários pedidos já têm consulta na sua agenda (a partir de ${fmtSP(when)}). Não propus nada: sugira outro horário à terapeuta.`;
      const aviso = emConflito ? ` Atenção: ${emConflito} data(s) já têm consulta e serão puladas.` : "";
      const resumo = semanas > 1
        ? `Agendar ${semanas} consultas semanais com ${nome}, ${duration} min, a partir de ${fmtSP(when)}.${aviso}`
        : `Agendar consulta com ${nome} em ${fmtSP(when)}, ${duration} minutos.${aviso}`;

      const confirmacao = confirmarOuPropor("agendar_consulta", patient.therapistId, params, codigoConfirmacao, resumo);
      if (!confirmacao.ok) return confirmacao.reply;
      return executarAcaoAgenda(db, ctx, "agendar_consulta", params);
    }, {
      name: "agendar_consulta",
      description: "Cria uma consulta (ou várias semanais, via repetirSemanas) para o paciente autorizado (ESCRITA). Chame PRIMEIRO sem codigoConfirmacao: a ferramenta devolve o resumo e um código, e a terapeuta passa a ver um botão de confirmação na tela. Só repita a chamada com o código se ela confirmar por texto. Checa conflito. Não define preço nem toca em prontuários.",
      schema: z.object({
        patientId: z.number().int().positive().optional(),
        scheduledAt: z.string().min(10).describe("Data e hora ISO 8601 no fuso America/Sao_Paulo, ex.: 2026-08-25T14:00:00"),
        durationMinutes: z.number().int().positive().max(480).optional().describe("Duração em minutos (padrão 60)"),
        notes: z.string().trim().max(500).optional().describe("Observação opcional da consulta"),
        repetirSemanas: z.number().int().min(1).max(12).optional().describe("Recorrência: repetir semanalmente por N semanas (padrão 1)"),
        codigoConfirmacao: codigoConfirmacaoSchema,
      }),
    }),

    // REMARCAR
    tool(async ({ appointmentId, patientId, novoHorario, novaDuracaoMinutos, codigoConfirmacao }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      if (appt.status === "cancelled") return `A consulta #${appointmentId} está cancelada; agende uma nova em vez de remarcar.`;
      const when = parseHorarioSP(novoHorario);
      if (!when) return "Novo horário inválido. Peça a data e a hora exatas.";
      if (when.getTime() < Date.now()) return "O novo horário já passou. Escolha uma data futura.";
      const duration = novaDuracaoMinutos && novaDuracaoMinutos > 0 ? Math.min(novaDuracaoMinutos, 480) : (appt.duration ?? 60);
      const conflito = await horarioEmConflito(db, appt.therapistId, when, duration, appt.id);
      if (conflito) return `CONFLITO DE HORÁRIO: já existe uma consulta às ${fmtSP(conflito, false)}. Não remarquei. Sugira outro horário.`;
      const params = { appointmentId: appt.id, novoHorario: when.toISOString(), duration };
      const resumo = `Mover a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)} para ${fmtSP(when)}, ${duration} min.`;

      const confirmacao = confirmarOuPropor("remarcar_consulta", appt.therapistId, params, codigoConfirmacao, resumo);
      if (!confirmacao.ok) return confirmacao.reply;
      return executarAcaoAgenda(db, ctx, "remarcar_consulta", params);
    }, {
      name: "remarcar_consulta",
      description: "Muda a data/hora (e opcionalmente a duração) de uma consulta existente (ESCRITA). Descubra o appointmentId com get_patient_appointments. Chame primeiro sem codigoConfirmacao: a terapeuta recebe o resumo e um botão de confirmação. Checa conflito.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        novoHorario: z.string().min(10).describe("Nova data e hora ISO 8601 no fuso America/Sao_Paulo"),
        novaDuracaoMinutos: z.number().int().positive().max(480).optional(),
        codigoConfirmacao: codigoConfirmacaoSchema,
      }),
    }),

    // CANCELAR
    tool(async ({ appointmentId, patientId, codigoConfirmacao }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      if (appt.status === "cancelled") return `A consulta #${appointmentId} já está cancelada.`;
      const params = { appointmentId: appt.id };
      const resumo = `Cancelar a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)}.`;

      const confirmacao = confirmarOuPropor("cancelar_consulta", appt.therapistId, params, codigoConfirmacao, resumo);
      if (!confirmacao.ok) return confirmacao.reply;
      return executarAcaoAgenda(db, ctx, "cancelar_consulta", params);
    }, {
      name: "cancelar_consulta",
      description: "Cancela uma consulta existente (ESCRITA; marca status cancelada). Descubra o appointmentId com get_patient_appointments. Chame primeiro sem codigoConfirmacao: a terapeuta recebe o resumo e um botão de confirmação.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        codigoConfirmacao: codigoConfirmacaoSchema,
      }),
    }),

    // REGISTRAR PAGAMENTO
    tool(async ({ appointmentId, patientId, pago, codigoConfirmacao }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      const marcarPago = pago !== false; // padrão: marcar como paga
      const params = { appointmentId: appt.id, pago: marcarPago };
      const resumo = `Marcar a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)} como ${marcarPago ? "paga" : "pendente"}.`;

      const confirmacao = confirmarOuPropor("registrar_pagamento", appt.therapistId, params, codigoConfirmacao, resumo);
      if (!confirmacao.ok) return confirmacao.reply;
      return executarAcaoAgenda(db, ctx, "registrar_pagamento", params);
    }, {
      name: "registrar_pagamento",
      description: "Marca uma consulta como paga ou pendente (ESCRITA; controle financeiro simples). Descubra o appointmentId com get_patient_appointments. Chame primeiro sem codigoConfirmacao: a terapeuta recebe o resumo e um botão de confirmação. pago=false volta para pendente.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        pago: z.boolean().optional().describe("true (padrão) marca paga; false volta para pendente"),
        codigoConfirmacao: codigoConfirmacaoSchema,
      }),
    }),
  ] : [];

  return [
    tool(async ({ patientId }) => JSON.stringify(await readPatientAppointments(ctx, patientId, db)), {
      name: ctx.role === "therapist" ? "get_patient_appointments" : "get_my_appointments",
      description: "Consulta somente leitura os próximos e últimos agendamentos autorizados. Para terapeuta, informe patientId.",
      schema: patientIdSchema,
    }),
    tool(async ({ patientId }) => JSON.stringify(await readPatientSessions(ctx, patientId, db)), {
      name: ctx.role === "therapist" ? "get_patient_sessions" : "get_my_sessions",
      description: "Consulta somente leitura sessões e campos clínicos já registrados. Para terapeuta, informe patientId.",
      schema: patientIdSchema,
    }),
    tool(async ({ patientId }) => JSON.stringify(await readPatientDocuments(ctx, patientId, db)), {
      name: ctx.role === "therapist" ? "get_patient_documents" : "get_my_documents",
      description: "Consulta somente leitura metadados de documentos autorizados; nunca retorna URL privada ou chave de storage.",
      schema: patientIdSchema,
    }),
    tool(async ({ query, patientId }) => {
      if (!(await hasAuthorizedClinicalData(ctx, patientId, db))) {
        return "Nenhum registro clínico autorizado foi encontrado para este paciente. Não invente informações; informe isso claramente e ofereça apenas ajuda geral que não dependa de prontuários.";
      }
      const queryEmbedding = await embeddingForCurrentEnvironment().getTextEmbedding(query);
      const indexedChunks = await searchIndexedDocumentChunks(
        ctx,
        queryEmbedding,
        patientId,
        Number(process.env.AI_RAG_TOP_K ?? 6),
        db,
      );
      const maxContextChars = Math.max(2_000, Number(process.env.AI_RAG_CONTEXT_MAX_CHARS ?? 8_000));
      const seen = new Set<string>();
      const structuredSources: AiSourceReference[] = [];
      for (const chunk of indexedChunks) {
        const key = `document:${chunk.documentId}`;
        if (structuredSources.some(source => `${source.sourceType}:${source.sourceId}` === key)) continue;
        const metadata = chunk.metadata as { requiresReview?: boolean } | null | undefined;
        structuredSources.push({
          sourceType: "document",
          sourceId: chunk.documentId,
          patientId: chunk.patientId,
          requiresReview: metadata?.requiresReview === true,
        });
      }
      if (structuredSources.length) onSources?.(structuredSources);
      const documentContext = indexedChunks.map((chunk, index) => {
        const key = `${chunk.documentId}:${chunk.pageNumber ?? "na"}:${chunk.content}`;
        if (seen.has(key)) return "";
        seen.add(key);
        const metadata = chunk.metadata as { requiresReview?: boolean; ocrConfidence?: number | null } | null | undefined;
        const reviewLabel = metadata?.requiresReview ? ` | revisão OCR necessária${metadata.ocrConfidence != null ? ` (${metadata.ocrConfidence.toFixed(0)}%)` : ""}` : "";
        return `[Fonte ${index + 1} | documento ${chunk.documentId} | página ${chunk.pageNumber ?? "não informada"} | paciente ${chunk.patientId}${reviewLabel}]\n${chunk.content}`;
      }).filter(Boolean).join("\n\n").slice(0, maxContextChars);
      if (documentContext) return wrapUntrustedClinicalContext(documentContext);
      const sources = await retrieveScopedClinicalContext(ctx, {
        query,
        patientId,
        topK: Number(process.env.AI_RAG_TOP_K ?? 6),
      }, db);
      onSources?.(sources.map(source => ({
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        patientId: source.patientId,
        requiresReview: source.requiresReview,
      })));
      const formatted = formatRagContext(sources);
      return formatted ? wrapUntrustedClinicalContext(formatted) : "Nenhum registro autorizado foi encontrado.";
    }, {
      name: ctx.role === "therapist" ? "search_patient_records" : "search_my_records",
      description: "Busca semântica somente leitura em registros autorizados do paciente. Não diagnostica nem altera prontuários.",
      schema: z.object({
        query: z.string().trim().min(3).max(500),
        patientId: z.number().int().positive().optional(),
      }),
    }),
    ...schedulingTools,
  ];
}
