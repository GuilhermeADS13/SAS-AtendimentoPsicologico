-- Fase 2 da aba "Evolução" do prontuário: por sessão, o humor de 0 a 10 (para o
-- gráfico da evolução) e a fase do tratamento (avaliação → intervenção →
-- manutenção → encerramento). O humor em texto livre ("mood") continua igual.
-- Colunas aditivas, nulas (sessões antigas ficam sem), seguras de reaplicar.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "moodScore" smallint;
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "fase" varchar(20);

-- O banco também barra valor fora da regra (não só o formulário/servidor).
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_moodScore_0_a_10";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_moodScore_0_a_10" CHECK ("moodScore" BETWEEN 0 AND 10);
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_fase_valida";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_fase_valida"
  CHECK ("fase" IN ('avaliacao', 'intervencao', 'manutencao', 'encerramento'));
