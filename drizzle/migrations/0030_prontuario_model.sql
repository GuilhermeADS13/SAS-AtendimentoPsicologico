-- Modelo de prontuário por profissional: texto extraído do PDF/DOCX que ele
-- envia + o nome do arquivo. A Luma usa como formato a seguir (escopo do
-- profissional). Aditivo e idempotente. Ver drizzle/schema.ts (therapists).
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "prontuarioModel" text;
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "prontuarioModelName" varchar(256);
