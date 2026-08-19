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

  // Única ferramenta de ESCRITA, só para terapeuta: cria consulta com confirmação
  // obrigatória (dupla trava: a flag confirmadoPeloUsuario + a regra no prompt) e
  // checagem de conflito de horário. Não mexe em prontuário.
  const schedulingTools = ctx.role === "therapist" ? [
    tool(async ({ patientId, scheduledAt, durationMinutes, notes, confirmadoPeloUsuario }) => {
      const patient = await authorizedPatient(db, ctx, patientId);
      // Brasil não tem horário de verão desde 2019: naive (sem fuso) = America/Sao_Paulo (-03:00).
      const raw = scheduledAt.trim();
      const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}-03:00`;
      const when = new Date(iso);
      if (Number.isNaN(when.getTime())) {
        return "Data/hora inválida. Peça à terapeuta a data e a hora exatas (ex.: 25/08/2026 às 14:00).";
      }
      if (when.getTime() < Date.now()) {
        return "Esse horário já passou. Confirme uma data e hora futuras antes de agendar.";
      }
      const duration = durationMinutes && durationMinutes > 0 ? Math.min(durationMinutes, 480) : 60;
      const quando = when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "short" });
      const nome = `${patient.firstName} ${patient.lastName}`.trim();

      if (confirmadoPeloUsuario !== true) {
        return `AINDA NÃO AGENDADO. Repita para a terapeuta e peça confirmação explícita: consulta com ${nome} em ${quando}, ${duration} minutos. Só chame agendar_consulta de novo, com confirmadoPeloUsuario=true, depois de um "sim" claro dela.`;
      }

      // Conflito: consultas não canceladas da terapeuta que se sobreponham a
      // [when, when+duration). Janela de 8h cobre a duração máxima permitida.
      const janelaMs = 8 * 60 * 60 * 1000;
      const candidatas = await db.select({ id: appointments.id, scheduledAt: appointments.scheduledAt, duration: appointments.duration })
        .from(appointments)
        .where(and(
          eq(appointments.therapistId, patient.therapistId),
          ne(appointments.status, "cancelled"),
          gte(appointments.scheduledAt, new Date(when.getTime() - janelaMs)),
          lte(appointments.scheduledAt, new Date(when.getTime() + duration * 60_000)),
        ));
      const inicioNovo = when.getTime();
      const fimNovo = inicioNovo + duration * 60_000;
      const conflito = candidatas.find(a => {
        const inicio = a.scheduledAt.getTime();
        const fim = inicio + (a.duration ?? 60) * 60_000;
        return inicioNovo < fim && inicio < fimNovo;
      });
      if (conflito) {
        const q = conflito.scheduledAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
        return `CONFLITO DE HORÁRIO: já existe uma consulta às ${q}. NÃO agendei nada. Sugira outro horário à terapeuta.`;
      }

      const [criada] = await db.insert(appointments).values({
        therapistId: patient.therapistId,
        patientId: patient.id,
        scheduledAt: when,
        duration,
        notes: notes?.trim() || null,
        roomToken: nanoid(16),
      }).returning({ id: appointments.id });
      return `AGENDADO com sucesso: ${nome} em ${quando}, ${duration} minutos (consulta #${criada.id}). A consulta já está na agenda.`;
    }, {
      name: "agendar_consulta",
      description: "Cria UMA consulta para o paciente autorizado (ação de ESCRITA). Regra obrigatória: NUNCA agende na mesma mensagem do pedido. Primeiro chame SEM confirmadoPeloUsuario (ou com false) para obter o resumo, mostre-o e peça confirmação; só chame com confirmadoPeloUsuario=true depois de a terapeuta confirmar com um 'sim' explícito. Faz checagem de conflito de horário. Não define preço nem toca em prontuários.",
      schema: z.object({
        patientId: z.number().int().positive().optional(),
        scheduledAt: z.string().min(10).describe("Data e hora ISO 8601 no fuso America/Sao_Paulo, ex.: 2026-08-25T14:00:00"),
        durationMinutes: z.number().int().positive().max(480).optional().describe("Duração em minutos (padrão 60)"),
        notes: z.string().trim().max(500).optional().describe("Observação opcional da consulta"),
        confirmadoPeloUsuario: z.boolean().optional().describe("true SOMENTE após a terapeuta confirmar explicitamente os detalhes na conversa"),
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
