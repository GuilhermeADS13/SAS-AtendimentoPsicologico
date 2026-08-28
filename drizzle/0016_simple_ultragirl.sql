-- Reconciliacao de drift entre o schema do codigo e o historico de migrations.
--
-- Estes objetos existem no banco de PRODUCAO (as features foram ao ar aplicando
-- as mudancas direto) mas nao existiam em NENHUMA migration: um banco criado do
-- zero -- o Postgres efemero do CI, um ambiente novo, uma restauracao -- ficava
-- sem a tabela de feedback, sem os clientRequestId (idempotencia do ai.chat) e
-- sem appointments.paymentUpdatedBy. Era o que derrubava os testes de
-- integracao com 'column "paymentUpdatedBy" ... does not exist'.
--
-- Por isso TODO comando aqui e idempotente: esta migration precisa rodar tanto
-- no banco de producao, onde nao deve mudar nada, quanto num banco limpo, onde
-- cria tudo.

DO $$ BEGIN
	CREATE TYPE "public"."ai_feedback_rating" AS ENUM('helpful', 'not_helpful');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "aiMessageFeedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"messageId" integer NOT NULL,
	"userId" integer NOT NULL,
	"rating" "ai_feedback_rating" NOT NULL,
	"reason" varchar(80),
	"comment" varchar(500),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "aiConversations" ADD COLUMN IF NOT EXISTS "clientRequestId" varchar(80);--> statement-breakpoint
ALTER TABLE "aiMessages" ADD COLUMN IF NOT EXISTS "clientRequestId" varchar(80);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "paymentUpdatedBy" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_message_feedback_message_user_unique" ON "aiMessageFeedback" USING btree ("messageId","userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_message_feedback_user_created_idx" ON "aiMessageFeedback" USING btree ("userId","createdAt");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "appointments" ADD CONSTRAINT "appointments_paymentUpdatedBy_users_id_fk" FOREIGN KEY ("paymentUpdatedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversations_user_request_idx" ON "aiConversations" USING btree ("userId","clientRequestId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_messages_conversation_request_idx" ON "aiMessages" USING btree ("conversationId","clientRequestId");
