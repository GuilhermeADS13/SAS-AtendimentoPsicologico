-- Documento que a psicóloga escolheu mostrar ao paciente. Nulo = privado, que é o
-- padrão de todo documento, inclusive os que já existem.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "tipoParaPaciente" varchar(20);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "compartilhadoEm" timestamp with time zone;
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_tipoParaPaciente_check";
ALTER TABLE "documents" ADD CONSTRAINT "documents_tipoParaPaciente_check"
  CHECK ("tipoParaPaciente" IS NULL OR "tipoParaPaciente" IN ('laudo', 'parecer', 'atestado', 'declaracao', 'relatorio'));
