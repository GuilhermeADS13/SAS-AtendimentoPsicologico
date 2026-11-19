-- Férias e folgas da psicóloga (2026-11-19): nos dias marcados, os horários de primeira
-- conversa somem da busca de pacientes e a Agenda mostra as consultas marcadas no período,
-- para ela desmarcar e avisar. Dias do calendário de Brasília, com o último incluído.
-- Só acrescenta; segura de reaplicar.

CREATE TABLE IF NOT EXISTS "ferias" (
  "id" serial PRIMARY KEY,
  "therapistId" integer NOT NULL REFERENCES "therapists"("id") ON DELETE CASCADE,
  "inicio" date NOT NULL,
  "fim" date NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ferias_fim_nao_antes_do_inicio" CHECK ("fim" >= "inicio")
);

CREATE INDEX IF NOT EXISTS "ferias_therapistId_idx" ON "ferias" ("therapistId");

-- Como as outras tabelas: RLS ligada e sem políticas (só o servidor lê e grava).
ALTER TABLE "ferias" ENABLE ROW LEVEL SECURITY;
