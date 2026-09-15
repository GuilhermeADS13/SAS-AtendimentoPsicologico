-- Modelos de anotação do psicólogo (nome + corpo em markdown; um pode ser padrão).
-- Aditivo e idempotente. Ver drizzle/schema.ts (therapists) e shared/prontuario.ts.
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "noteTemplates" jsonb;
