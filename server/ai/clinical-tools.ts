import { tool } from "langchain";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { appointments, documents, patients, sessions, therapists } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AiAccessContext } from "./access";
import { embeddingForCurrentEnvironment, formatRagContext, retrieveScopedClinicalContext } from "./rag";
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

export function createClinicalTools(ctx: AiAccessContext, db: Db) {
  const patientIdSchema = z.object({ patientId: z.number().int().positive().optional() });

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
  ];
}
