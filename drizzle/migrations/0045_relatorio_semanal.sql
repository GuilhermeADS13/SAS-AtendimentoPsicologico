-- E-mail semanal do relatório da clínica (diferencial do Coro, 2026-10-28): guarda
-- quando foi o último envio, para sair um por semana mesmo com o ciclo de avisos
-- rodando a cada 15 min ou o servidor reiniciando. Só adiciona uma coluna vazia.
-- Aplicada pelo SQL Editor do Supabase em 2026-10-28.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "relatorioEnviadoEm" timestamptz;
