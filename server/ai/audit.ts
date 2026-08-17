import { aiAuditEvents } from "../../drizzle/schema";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type AuditEvent = {
  userId: number;
  conversationId?: number | null;
  action: string;
  resourceType?: string | null;
  resourceId?: number | null;
  metadata?: Record<string, string | number | boolean | null>;
};

const ALLOWED_METADATA_KEYS = new Set([
  "model",
  "intent",
  "rating",
  "reason",
  "patientScope",
  "sourceCount",
  "safetyIntercepted",
  "latencyMs",
]);

function minimizeMetadata(metadata?: AuditEvent["metadata"]) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([key, value]) =>
      ALLOWED_METADATA_KEYS.has(key) &&
      (value === null || ["string", "number", "boolean"].includes(typeof value)),
    ),
  );
}

/** Persiste somente eventos operacionais; nunca recebe prompt, resposta ou prontuário integral. */
export async function recordAiAuditEvent(db: Db, event: AuditEvent): Promise<void> {
  await db.insert(aiAuditEvents).values({
    userId: event.userId,
    conversationId: event.conversationId ?? null,
    action: event.action.slice(0, 64),
    resourceType: event.resourceType?.slice(0, 64) ?? null,
    resourceId: event.resourceId ?? null,
    metadata: minimizeMetadata(event.metadata),
  });
}
