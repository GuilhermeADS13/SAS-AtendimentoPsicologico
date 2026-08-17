-- Compatibility migration for Luma conversation persistence.
-- Safe to run repeatedly and does not touch clinical records.

DO $$
BEGIN
  CREATE TYPE "public"."ai_conversation_status" AS ENUM ('active', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "public"."ai_message_role" AS ENUM ('system', 'user', 'assistant', 'tool');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "aiConversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "therapistId" integer,
  "patientId" integer,
  "status" "public"."ai_conversation_status" DEFAULT 'active' NOT NULL,
  "title" varchar(160),
  "model" varchar(128),
  "lastMessageAt" timestamp with time zone,
  "retentionExpiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "therapistId" integer;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "patientId" integer;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "status" "public"."ai_conversation_status" DEFAULT 'active' NOT NULL;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "title" varchar(160);
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "model" varchar(128);
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "lastMessageAt" timestamp with time zone;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "retentionExpiresAt" timestamp with time zone;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;

CREATE TABLE IF NOT EXISTS "aiMessages" (
  "id" serial PRIMARY KEY NOT NULL,
  "conversationId" integer NOT NULL,
  "role" "public"."ai_message_role" NOT NULL,
  "content" text NOT NULL,
  "contentRedacted" boolean DEFAULT false NOT NULL,
  "providerMessageId" varchar(256),
  "tokenCount" integer,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "aiMessages" ADD COLUMN IF NOT EXISTS "contentRedacted" boolean DEFAULT false NOT NULL;
ALTER TABLE "aiMessages" ADD COLUMN IF NOT EXISTS "providerMessageId" varchar(256);
ALTER TABLE "aiMessages" ADD COLUMN IF NOT EXISTS "tokenCount" integer;
ALTER TABLE "aiMessages" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now() NOT NULL;

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

CREATE INDEX IF NOT EXISTS "ai_conversations_user_status_idx"
  ON "aiConversations" ("userId", "status");
CREATE INDEX IF NOT EXISTS "ai_conversations_clinical_scope_idx"
  ON "aiConversations" ("therapistId", "patientId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ai_messages_conversation_created_idx"
  ON "aiMessages" ("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_audit_events_user_created_idx"
  ON "aiAuditEvents" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_audit_events_conversation_idx"
  ON "aiAuditEvents" ("conversationId");
