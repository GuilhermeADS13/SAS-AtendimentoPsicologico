CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "aiDocumentChunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"documentId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"therapistId" integer NOT NULL,
	"chunkIndex" integer NOT NULL,
	"content" text NOT NULL,
	"contentHash" varchar(64) NOT NULL,
	"embedding" vector(768) NOT NULL,
	"pageNumber" integer,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_document_chunks_document_chunk_idx" ON "aiDocumentChunks" USING btree ("documentId","chunkIndex");
--> statement-breakpoint
CREATE INDEX "ai_document_chunks_clinical_scope_idx" ON "aiDocumentChunks" USING btree ("therapistId","patientId");
--> statement-breakpoint
CREATE INDEX "ai_document_chunks_content_hash_idx" ON "aiDocumentChunks" USING btree ("contentHash");
--> statement-breakpoint
CREATE INDEX "ai_document_chunks_embedding_hnsw_idx" ON "aiDocumentChunks" USING hnsw ("embedding" vector_cosine_ops);
