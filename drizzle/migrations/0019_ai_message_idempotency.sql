-- Idempotência das conversas e mensagens da Luma.
-- Reexecução segura; não altera prontuários nem escopos clínicos.
ALTER TABLE "aiConversations"
  ADD COLUMN IF NOT EXISTS "clientRequestId" varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_conversations_user_request_idx"
  ON "aiConversations" ("userId", "clientRequestId");

ALTER TABLE "aiMessages"
  ADD COLUMN IF NOT EXISTS "clientRequestId" varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_messages_conversation_request_idx"
  ON "aiMessages" ("conversationId", "clientRequestId");

COMMENT ON COLUMN "aiMessages"."clientRequestId" IS
  'Identificador idempotente do envio do cliente; evita duplicação em retries.';

