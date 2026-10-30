-- O teste grátis passa a contar só a partir do primeiro paciente (2026-10-30), para
-- ninguém perder dias entre a aprovação do CRP e começar a usar. A coluna diz que a
-- psicóloga tem direito ao teste e ele ainda não começou.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "testeAguardando" boolean NOT NULL DEFAULT false;

-- Quem está em teste e ainda não cadastrou paciente volta a aguardar. O "testeAte" fica
-- como está: o código antigo, que ainda roda até o deploy, continua liberando por ele.
UPDATE "assinaturas" a
SET "testeAguardando" = true
WHERE a."testeAte" > now()
  AND a."pagoAte" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "patients" p WHERE p."therapistId" = a."therapistId");
