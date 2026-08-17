CREATE TYPE "public"."aiDocumentProcessingStatus" AS ENUM('pending', 'processing', 'indexed', 'failed');--> statement-breakpoint
CREATE TABLE "aiDocumentJobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" integer NOT NULL,
	"status" "aiDocumentProcessingStatus" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"maxAttempts" integer DEFAULT 5 NOT NULL,
	"availableAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lockedAt" timestamp with time zone,
	"lockedBy" varchar(120),
	"lastError" text,
	"processedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_document_jobs_document_unique_idx" ON "aiDocumentJobs" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "ai_document_jobs_status_available_idx" ON "aiDocumentJobs" USING btree ("status","availableAt");