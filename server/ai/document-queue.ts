import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { aiDocumentJobs, documents } from "../../drizzle/schema";
import { getDb } from "../db";
import { ingestClinicalDocument } from "./document-ingestion";
import type { AiAccessContext } from "./access";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ClaimedJob = {
  id: number;
  documentId: number;
  attempts: number;
  maxAttempts: number;
};

export async function enqueueDocumentIndexing(documentId: number, dbOverride?: Db) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.insert(aiDocumentJobs).values({ documentId, status: "pending", attempts: 0 })
    .onConflictDoUpdate({
      target: aiDocumentJobs.documentId,
      set: {
        status: sql`CASE WHEN ${aiDocumentJobs.status} = 'indexed' THEN ${aiDocumentJobs.status} ELSE 'pending' END`,
        attempts: 0,
        availableAt: sql`now()`,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  return rows[0];
}

export async function getDocumentIndexingStatus(documentId: number, dbOverride?: Db) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(aiDocumentJobs).where(eq(aiDocumentJobs.documentId, documentId)).limit(1);
  return rows[0] ?? null;
}

export async function claimNextDocumentJob(workerId = randomUUID(), dbOverride?: Db): Promise<ClaimedJob | null> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    WITH candidate AS (
      SELECT "id"
      FROM "aiDocumentJobs"
      WHERE (
        "status" = 'pending' AND "availableAt" <= now()
      ) OR (
        "status" = 'processing' AND "lockedAt" < now() - interval '15 minutes' AND "attempts" < "maxAttempts"
      )
      ORDER BY "availableAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "aiDocumentJobs" AS job
    SET "status" = 'processing',
        "attempts" = job."attempts" + 1,
        "lockedAt" = now(),
        "lockedBy" = ${workerId},
        "updatedAt" = now()
    FROM candidate
    WHERE job."id" = candidate."id"
    RETURNING job."id", job."documentId", job."attempts", job."maxAttempts"
  `);
  const row = (result as unknown as { rows: ClaimedJob[] }).rows[0];
  return row ?? null;
}

export async function markDocumentJobIndexed(jobId: number, workerId: string, dbOverride?: Db) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(aiDocumentJobs).set({
    status: "indexed",
    processedAt: sql`now()`,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    updatedAt: sql`now()`,
  }).where(and(eq(aiDocumentJobs.id, jobId), eq(aiDocumentJobs.lockedBy, workerId)));
}

export async function markDocumentJobFailed(job: ClaimedJob, workerId: string, error: unknown, dbOverride?: Db) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const message = error instanceof Error ? error.message : String(error);
  const retryable = job.attempts < job.maxAttempts;
  await db.update(aiDocumentJobs).set({
    status: retryable ? "pending" : "failed",
    availableAt: sql`now() + (${Math.min(job.attempts * 30, 300)} || ' seconds')::interval`,
    lockedAt: null,
    lockedBy: null,
    lastError: message.slice(0, 2000),
    updatedAt: sql`now()`,
  }).where(and(eq(aiDocumentJobs.id, job.id), eq(aiDocumentJobs.lockedBy, workerId)));
}

/**
 * Marca como 'failed' os jobs presos em 'processing' com lock vencido que JÁ
 * esgotaram as tentativas. Sem isto, um job cujo worker morre (crash/OOM/deploy)
 * exatamente na última tentativa ficava órfão para sempre: a cláusula de reclaim
 * exige `attempts < maxAttempts` e nunca o pegava de volta, e o dead-letter (que
 * conta status='failed') nunca o via — o job ficava eternamente em 'processing',
 * inflando a fila e nunca indexando o documento. Aqui ele é dead-lettered.
 */
export async function deadLetterStaleJobs(dbOverride?: Db): Promise<number> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    UPDATE "aiDocumentJobs"
    SET "status" = 'failed',
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "lastError" = COALESCE("lastError", 'Worker interrompido apos esgotar as tentativas'),
        "updatedAt" = now()
    WHERE "status" = 'processing'
      AND "lockedAt" < now() - interval '15 minutes'
      AND "attempts" >= "maxAttempts"
  `);
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export async function processNextDocumentJob(dbOverride?: Db): Promise<ClaimedJob | null> {
  const workerId = randomUUID();
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  // Recupera órfãos presos em 'processing' que já esgotaram as tentativas antes
  // de reivindicar o próximo — senão nunca sairiam da fila.
  await deadLetterStaleJobs(db);
  const job = await claimNextDocumentJob(workerId, db);
  if (!job) return null;
  try {
    const documentRows = await db.select({ therapistId: documents.therapistId }).from(documents)
      .where(eq(documents.id, job.documentId)).limit(1);
    const document = documentRows[0];
    if (!document) throw new Error("Documento da fila não existe");
    const workerContext: AiAccessContext = {
      userId: 0,
      role: "therapist",
      therapistId: document.therapistId,
      patientId: null,
    };
    await ingestClinicalDocument(workerContext, job.documentId, db);
    await markDocumentJobIndexed(job.id, workerId, db);
    return job;
  } catch (error) {
    await markDocumentJobFailed(job, workerId, error, db);
    throw error;
  }
}
