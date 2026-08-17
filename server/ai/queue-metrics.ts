import { sql } from "drizzle-orm";
import { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type DocumentQueueMetrics = {
  pending: number;
  processing: number;
  indexed: number;
  failed: number;
  backlog: number;
  oldestPendingAt: string | null;
  oldestProcessingAt: string | null;
  oldestPendingAgeSeconds: number | null;
  oldestProcessingAgeSeconds: number | null;
  generatedAt: string;
};

export async function getDocumentQueueMetrics(dbOverride?: Db): Promise<DocumentQueueMetrics> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE "status" = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE "status" = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE "status" = 'indexed')::int AS indexed,
      COUNT(*) FILTER (WHERE "status" = 'failed')::int AS failed,
      MIN("availableAt") FILTER (WHERE "status" = 'pending') AS "oldestPendingAt",
      MIN("lockedAt") FILTER (WHERE "status" = 'processing') AS "oldestProcessingAt",
      EXTRACT(EPOCH FROM (now() - MIN("availableAt") FILTER (WHERE "status" = 'pending')))::int AS "oldestPendingAgeSeconds",
      EXTRACT(EPOCH FROM (now() - MIN("lockedAt") FILTER (WHERE "status" = 'processing')))::int AS "oldestProcessingAgeSeconds"
    FROM "aiDocumentJobs"
  `);
  const row = (result as unknown as { rows: Array<Record<string, unknown>> }).rows[0] ?? {};
  const pending = Number(row.pending ?? 0);
  const processing = Number(row.processing ?? 0);
  const indexed = Number(row.indexed ?? 0);
  const failed = Number(row.failed ?? 0);
  return {
    pending,
    processing,
    indexed,
    failed,
    backlog: pending + processing,
    oldestPendingAt: row.oldestPendingAt ? new Date(String(row.oldestPendingAt)).toISOString() : null,
    oldestProcessingAt: row.oldestProcessingAt ? new Date(String(row.oldestProcessingAt)).toISOString() : null,
    oldestPendingAgeSeconds: row.oldestPendingAgeSeconds == null ? null : Number(row.oldestPendingAgeSeconds),
    oldestProcessingAgeSeconds: row.oldestProcessingAgeSeconds == null ? null : Number(row.oldestProcessingAgeSeconds),
    generatedAt: new Date().toISOString(),
  };
}

export function queueMetricsToPrometheus(metrics: DocumentQueueMetrics): string {
  return [
    `ai_document_jobs{status="pending"} ${metrics.pending}`,
    `ai_document_jobs{status="processing"} ${metrics.processing}`,
    `ai_document_jobs{status="indexed"} ${metrics.indexed}`,
    `ai_document_jobs{status="failed"} ${metrics.failed}`,
    `ai_document_queue_backlog ${metrics.backlog}`,
    `ai_document_queue_oldest_pending_age_seconds ${metrics.oldestPendingAgeSeconds ?? 0}`,
    `ai_document_queue_oldest_processing_age_seconds ${metrics.oldestProcessingAgeSeconds ?? 0}`,
  ].join("\n") + "\n";
}

export function logQueueAlerts(metrics: DocumentQueueMetrics): void {
  const maxAge = Number(process.env.AI_QUEUE_ALERT_MAX_AGE_SECONDS ?? 900);
  const maxFailed = Number(process.env.AI_QUEUE_ALERT_MAX_FAILED ?? 3);
  if ((metrics.oldestPendingAgeSeconds ?? 0) > maxAge) {
    console.error(JSON.stringify({ event: "ai_queue_backlog_alert", oldestPendingAgeSeconds: metrics.oldestPendingAgeSeconds, threshold: maxAge }));
  }
  if (metrics.failed > maxFailed) {
    console.error(JSON.stringify({ event: "ai_queue_failed_alert", failed: metrics.failed, threshold: maxFailed }));
  }
}
