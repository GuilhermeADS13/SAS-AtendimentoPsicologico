-- Chamada em grupo (terapia de casal; pais separados + criança): pacientes EXTRAS
-- de uma consulta, além do principal (appointments."patientId"). A psicóloga
-- adiciona; cada um entra na sala logado com a própria conta (ver roomAccess.ts).
-- Até 2 extras por consulta (4 pessoas na chamada com a psicóloga) — o limite é
-- do servidor (shared/chamadaEmGrupo.ts).
-- Tabela nova; nada existente muda. Segura de reaplicar.
CREATE TABLE IF NOT EXISTS "appointmentParticipants" (
  "id" serial PRIMARY KEY,
  "appointmentId" integer NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
  "patientId" integer NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "createdAt" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "appointmentParticipants_unico"
  ON "appointmentParticipants" ("appointmentId", "patientId");
-- "Minhas Consultas" do paciente procura por patientId.
CREATE INDEX IF NOT EXISTS "appointmentParticipants_patientId_idx"
  ON "appointmentParticipants" ("patientId");

-- Como as outras tabelas: RLS ligada e SEM políticas. O app acessa pelo backend;
-- a API pública do Supabase não enxerga nada desta tabela.
ALTER TABLE "appointmentParticipants" ENABLE ROW LEVEL SECURITY;
