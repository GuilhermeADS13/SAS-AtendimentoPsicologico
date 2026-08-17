CREATE TYPE "public"."ai_conversation_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_scope" AS ENUM('user', 'therapist', 'patient');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_status" AS ENUM('active', 'superseded', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."ai_memory_type" AS ENUM('preference', 'conversation_summary', 'workflow_context');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TABLE "aiAuditEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"conversationId" integer,
	"action" varchar(64) NOT NULL,
	"resourceType" varchar(64),
	"resourceId" integer,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiConversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"therapistId" integer,
	"patientId" integer,
	"status" "ai_conversation_status" DEFAULT 'active' NOT NULL,
	"title" varchar(160),
	"model" varchar(128),
	"lastMessageAt" timestamp with time zone,
	"retentionExpiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiMemories" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" "ai_memory_scope" NOT NULL,
	"memoryType" "ai_memory_type" NOT NULL,
	"userId" integer NOT NULL,
	"therapistId" integer,
	"patientId" integer,
	"content" text NOT NULL,
	"sourceConversationId" integer,
	"status" "ai_memory_status" DEFAULT 'active' NOT NULL,
	"importance" integer DEFAULT 50 NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"contentRedacted" boolean DEFAULT false NOT NULL,
	"providerMessageId" varchar(256),
	"tokenCount" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_audit_events_user_created_idx" ON "aiAuditEvents" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE INDEX "ai_audit_events_conversation_idx" ON "aiAuditEvents" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "ai_conversations_user_status_idx" ON "aiConversations" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "ai_conversations_clinical_scope_idx" ON "aiConversations" USING btree ("therapistId","patientId","updatedAt");--> statement-breakpoint
CREATE INDEX "ai_memories_user_status_idx" ON "aiMemories" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "ai_memories_scope_lookup_idx" ON "aiMemories" USING btree ("scope","therapistId","patientId","status");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_created_idx" ON "aiMessages" USING btree ("conversationId","createdAt");