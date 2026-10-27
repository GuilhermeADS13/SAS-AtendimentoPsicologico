-- Plano ESCOLHIDO pela psicóloga ("como a Netflix", decisão de 2026-10-26):
-- 'pro' (Sussurro, até 10 pacientes), 'max' (Voz, até 30) ou 'unlimited' (Coro,
-- combinado). O preço continua por paciente, com o mínimo do plano — ver
-- shared/precos.ts (valorDoPlano). Todas começam no Sussurro.
-- Só adiciona uma coluna; nada existente muda.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "plano" varchar(10) DEFAULT 'pro' NOT NULL;
