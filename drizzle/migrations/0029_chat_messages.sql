-- Chat 1:1 entre psicóloga e paciente (fora da sessão). Tabela nova, idempotente
-- (CREATE TABLE / INDEX IF NOT EXISTS). Ver drizzle/schema.ts (chatMessages).
CREATE TABLE IF NOT EXISTS "chatMessages" (
  "id" serial PRIMARY KEY,
  "therapistId" integer NOT NULL,
  "patientId" integer NOT NULL,
  "senderUserId" integer NOT NULL,
  "senderRole" varchar(16) NOT NULL,
  "content" text,
  "fileKey" varchar(512),
  "fileName" varchar(256),
  "fileType" varchar(100),
  "fileSize" integer,
  "readAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "chatMessages_thread_idx"
  ON "chatMessages" ("therapistId", "patientId", "createdAt");
