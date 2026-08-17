DO $$ BEGIN
  CREATE TYPE "public"."ai_memory_scope" AS ENUM('user', 'therapist', 'patient');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ai_memory_type" AS ENUM('preference', 'conversation_summary', 'workflow_context');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."ai_memory_status" AS ENUM('active', 'superseded', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "aiMemories" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" "public"."ai_memory_scope" NOT NULL,
  "memoryType" "public"."ai_memory_type" NOT NULL,
  "userId" integer NOT NULL,
  "therapistId" integer,
  "patientId" integer,
  "content" text NOT NULL,
  "sourceConversationId" integer,
  "status" "public"."ai_memory_status" DEFAULT 'active' NOT NULL,
  "importance" integer DEFAULT 50 NOT NULL,
  "expiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_memories_user_status_idx"
  ON "aiMemories" ("userId", "status");
CREATE INDEX IF NOT EXISTS "ai_memories_scope_lookup_idx"
  ON "aiMemories" ("scope", "therapistId", "patientId", "status");

CREATE TABLE IF NOT EXISTS "aiAuditEvents" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "conversationId" integer,
  "action" varchar(64) NOT NULL,
  "resourceType" varchar(64),
  "resourceId" integer,
  "metadata" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_audit_events_user_created_idx"
  ON "aiAuditEvents" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_audit_events_conversation_idx"
  ON "aiAuditEvents" ("conversationId");
