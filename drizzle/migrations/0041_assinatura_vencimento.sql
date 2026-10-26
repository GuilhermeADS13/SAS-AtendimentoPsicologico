-- Dia de vencimento escolhido pela psicóloga (5, 10, 15, 20 ou 25 — ver
-- shared/assinatura.ts) e o controle do e-mail "seu plano vence em 3 dias":
-- "avisoEnviadoPara" guarda a data de vencimento já avisada, para o ciclo de
-- 15 min não mandar o mesmo e-mail de novo. Só adiciona colunas vazias.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "diaVencimento" smallint;
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "avisoEnviadoPara" timestamptz;
