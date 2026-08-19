import { tool } from "langchain";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import { appointments, documents, patients, sessions, therapists } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AiAccessContext } from "./access";
import { embeddingForCurrentEnvironment, formatRagContext, retrieveScopedClinicalContext, type RagSource } from "./rag";
import { searchIndexedDocumentChunks } from "./document-ingestion";
import { wrapUntrustedClinicalContext } from "./content-safety";

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
async function horarioEmConflito(
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

export function createClinicalTools(
  ctx: AiAccessContext,
  db: Db,
  onSources?: (sources: AiSourceReference[]) => void,
) {
  const patientIdSchema = z.object({ patientId: z.number().int().positive().optional() });

  // Ferramentas de ESCRITA, só para terapeuta. TODAS com dupla trava de confirmação
  // (flag confirmadoPeloUsuario + regra no prompt) e escopo no próprio paciente.
  // Nenhuma toca em prontuário/sessão/documento (esses seguem somente leitura).
  const schedulingTools = ctx.role === "therapist" ? [
    // AGENDAR (com recorrência semanal opcional)
    tool(async ({ patientId, scheduledAt, durationMinutes, notes, repetirSemanas, confirmadoPeloUsuario }) => {
      const patient = await authorizedPatient(db, ctx, patientId);
      const when = parseHorarioSP(scheduledAt);
      if (!when) return "Data/hora inválida. Peça à terapeuta a data e a hora exatas (ex.: 25/08/2026 às 14:00).";
      if (when.getTime() < Date.now()) return "Esse horário já passou. Confirme uma data e hora futuras antes de agendar.";
      const duration = durationMinutes && durationMinutes > 0 ? Math.min(durationMinutes, 480) : 60;
      const semanas = repetirSemanas && repetirSemanas > 0 ? Math.min(repetirSemanas, 12) : 1;
      const nome = `${patient.firstName} ${patient.lastName}`.trim();
      const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

      const slots = Array.from({ length: semanas }, (_, i) => new Date(when.getTime() + i * SEMANA_MS));
      const livres: Date[] = [];
      let emConflito = 0;
      for (const slot of slots) {
        if (await horarioEmConflito(db, patient.therapistId, slot, duration)) emConflito++;
        else livres.push(slot);
      }

      const resumo = semanas > 1
        ? `${semanas} consultas semanais com ${nome}, ${duration} min, a partir de ${fmtSP(when)}`
        : `consulta com ${nome} em ${fmtSP(when)}, ${duration} minutos`;
      if (confirmadoPeloUsuario !== true) {
        const aviso = emConflito ? ` Atenção: ${emConflito} data(s) já têm consulta e serão puladas.` : "";
        return `AINDA NÃO AGENDADO. Repita para a terapeuta e peça confirmação explícita: ${resumo}.${aviso} Só chame agendar_consulta de novo, com confirmadoPeloUsuario=true, depois de um "sim" claro dela.`;
      }
      if (!livres.length) return "Nenhuma consulta agendada: todos os horários já estão ocupados. Sugira outro horário à terapeuta.";

      const criadas = await db.insert(appointments).values(livres.map(slot => ({
        therapistId: patient.therapistId,
        patientId: patient.id,
        scheduledAt: slot,
        duration,
        notes: notes?.trim() || null,
        roomToken: nanoid(16),
      }))).returning({ id: appointments.id });
      const puladas = emConflito ? ` ${emConflito} pulada(s) por conflito.` : "";
      return `AGENDADO: ${criadas.length} consulta(s) para ${nome} (${duration} min), começando ${fmtSP(when)}.${puladas} Os avisos serão enviados automaticamente.`;
    }, {
      name: "agendar_consulta",
      description: "Cria uma consulta (ou várias semanais, via repetirSemanas) para o paciente autorizado (ESCRITA). NUNCA agende na mesma mensagem do pedido: primeiro chame sem confirmadoPeloUsuario para o resumo, mostre e peça confirmação; só chame com confirmadoPeloUsuario=true após um 'sim' explícito. Checa conflito. Não define preço nem toca em prontuários.",
      schema: z.object({
        patientId: z.number().int().positive().optional(),
        scheduledAt: z.string().min(10).describe("Data e hora ISO 8601 no fuso America/Sao_Paulo, ex.: 2026-08-25T14:00:00"),
        durationMinutes: z.number().int().positive().max(480).optional().describe("Duração em minutos (padrão 60)"),
        notes: z.string().trim().max(500).optional().describe("Observação opcional da consulta"),
        repetirSemanas: z.number().int().min(1).max(12).optional().describe("Recorrência: repetir semanalmente por N semanas (padrão 1)"),
        confirmadoPeloUsuario: z.boolean().optional().describe("true SOMENTE após a terapeuta confirmar explicitamente"),
      }),
    }),

    // REMARCAR
    tool(async ({ appointmentId, patientId, novoHorario, novaDuracaoMinutos, confirmadoPeloUsuario }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      if (appt.status === "cancelled") return `A consulta #${appointmentId} está cancelada; agende uma nova em vez de remarcar.`;
      const when = parseHorarioSP(novoHorario);
      if (!when) return "Novo horário inválido. Peça a data e a hora exatas.";
      if (when.getTime() < Date.now()) return "O novo horário já passou. Escolha uma data futura.";
      const duration = novaDuracaoMinutos && novaDuracaoMinutos > 0 ? Math.min(novaDuracaoMinutos, 480) : (appt.duration ?? 60);
      const conflito = await horarioEmConflito(db, appt.therapistId, when, duration, appt.id);
      if (conflito) return `CONFLITO DE HORÁRIO: já existe uma consulta às ${fmtSP(conflito, false)}. Não remarquei. Sugira outro horário.`;
      if (confirmadoPeloUsuario !== true) {
        return `AINDA NÃO REMARCADO. Confirme com a terapeuta: mover a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)} para ${fmtSP(when)}, ${duration} min? Só chame de novo com confirmadoPeloUsuario=true após um "sim".`;
      }
      await db.update(appointments).set({ scheduledAt: when, duration })
        .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
      return `REMARCADA: consulta #${appointmentId} agora em ${fmtSP(when)}, ${duration} min.`;
    }, {
      name: "remarcar_consulta",
      description: "Muda a data/hora (e opcionalmente a duração) de uma consulta existente (ESCRITA). Descubra o appointmentId com get_patient_appointments. Peça confirmação antes; confirmadoPeloUsuario=true só após 'sim'. Checa conflito.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        novoHorario: z.string().min(10).describe("Nova data e hora ISO 8601 no fuso America/Sao_Paulo"),
        novaDuracaoMinutos: z.number().int().positive().max(480).optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
    }),

    // CANCELAR
    tool(async ({ appointmentId, patientId, confirmadoPeloUsuario }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      if (appt.status === "cancelled") return `A consulta #${appointmentId} já está cancelada.`;
      if (confirmadoPeloUsuario !== true) {
        return `AINDA NÃO CANCELADO. Confirme com a terapeuta: cancelar a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)}? Só chame de novo com confirmadoPeloUsuario=true após um "sim".`;
      }
      await db.update(appointments).set({ status: "cancelled" })
        .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
      return `CANCELADA: consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)}. O aviso de cancelamento será enviado automaticamente.`;
    }, {
      name: "cancelar_consulta",
      description: "Cancela uma consulta existente (ESCRITA; marca status cancelada). Descubra o appointmentId com get_patient_appointments. Peça confirmação antes; confirmadoPeloUsuario=true só após 'sim'.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        confirmadoPeloUsuario: z.boolean().optional(),
      }),
    }),

    // REGISTRAR PAGAMENTO
    tool(async ({ appointmentId, patientId, pago, confirmadoPeloUsuario }) => {
      const { appt, error } = await findOwnedAppointment(db, ctx, appointmentId, patientId);
      if (error || !appt) return error ?? "Consulta não encontrada.";
      const marcarPago = pago !== false; // padrão: marcar como paga
      const rotulo = marcarPago ? "paga" : "pendente";
      if (confirmadoPeloUsuario !== true) {
        return `AINDA NÃO REGISTRADO. Confirme com a terapeuta: marcar a consulta #${appointmentId} de ${fmtSP(appt.scheduledAt, false)} como ${rotulo}? Só chame de novo com confirmadoPeloUsuario=true após um "sim".`;
      }
      await db.update(appointments).set({ paid: marcarPago, paidAt: marcarPago ? new Date() : null })
        .where(and(eq(appointments.id, appt.id), eq(appointments.therapistId, appt.therapistId)));
      return `Consulta #${appointmentId} marcada como ${rotulo}.`;
    }, {
      name: "registrar_pagamento",
      description: "Marca uma consulta como paga ou pendente (ESCRITA; controle financeiro simples). Descubra o appointmentId com get_patient_appointments. Peça confirmação antes; confirmadoPeloUsuario=true só após 'sim'. pago=false volta para pendente.",
      schema: z.object({
        appointmentId: z.number().int().positive(),
        patientId: z.number().int().positive().optional(),
        pago: z.boolean().optional().describe("true (padrão) marca paga; false volta para pendente"),
        confirmadoPeloUsuario: z.boolean().optional(),
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
