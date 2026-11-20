-- Indique uma colega (2026-11-19): quando o suporte lança o mês grátis das duas, a
-- assinatura da INDICADA guarda a data. Assim o botão "Dar 1 mês às duas" vale uma vez só
-- por indicação. Só acrescenta; segura de reaplicar.
ALTER TABLE "assinaturas" ADD COLUMN IF NOT EXISTS "mesDaIndicacaoEm" timestamp with time zone;
