-- Prontuário psicológico (Resolução CFP nº 001/2009) + SOAP + Anamnese + TCLE.
--
-- Tudo é ADD COLUMN IF NOT EXISTS (aditivo e idempotente): reaplicar é seguro e
-- não há perda de dados. Colunas em camelCase precisam de aspas duplas.
-- Ver drizzle/schema.ts (patients, sessions) e shared/prontuario.ts.

-- patients: campos de topo do CFP + anamnese/TCLE (JSON).
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "initialDemand" text;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "therapeuticGoals" text;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "dischargeSummary" text;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "dischargedAt" timestamptz;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "anamnesis" jsonb;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "tcle" jsonb;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "tcleSignedAt" timestamptz;

-- sessions: evolução estruturada SOAP (colunas próprias, além dos campos livres).
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "subjective" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "objective" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "assessment" text;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "plan" text;
