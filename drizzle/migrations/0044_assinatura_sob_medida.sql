-- Condições SOB MEDIDA (plano Coro, ou qualquer acordo especial), definidas pelo
-- admin em Solicitações → Assinaturas. Nulo = vale o padrão do plano.
--   "valorCombinado": mensalidade combinada, em centavos (o anual é 10x).
--   "lumaPorDia": perguntas por dia à Luma clínica.
--   "anexoMb": tamanho máximo do anexo nas mensagens (até 20 MB, o teto do bucket).
-- Só adiciona colunas vazias; nada existente muda.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "valorCombinado" integer;
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "lumaPorDia" smallint;
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "anexoMb" smallint;
