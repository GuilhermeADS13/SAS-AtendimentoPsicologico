-- Frequência do atendimento definida pela psicóloga (aba "Evolução" do
-- prontuário): "semanal" | "quinzenal" | "mensal" | "dias:2,4" (dias da semana,
-- 0 = domingo). Nula = a tela calcula pelas sessões. Ver shared/frequencia.ts.
-- Coluna aditiva, nula, segura de reaplicar.
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "frequencia" varchar(40);

ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_frequencia_valida";
ALTER TABLE "patients" ADD CONSTRAINT "patients_frequencia_valida"
  CHECK ("frequencia" ~ '^(semanal|quinzenal|mensal|dias:[0-6](,[0-6]){0,6})$');
