-- Configurações da conta (2026-11-04): aparelhos conectados e avisos por e-mail.
-- Só acrescenta colunas (todas aceitam nulo); segura de reaplicar.

-- "Chrome no Windows", "Safari no iPhone"... e quando o aparelho foi usado por
-- último: sem isso, a lista de aparelhos só mostraria datas e ninguém saberia qual
-- é qual. Aparelhos confirmados antes desta migração ficam sem nome.
ALTER TABLE "aparelhosConfiaveis" ADD COLUMN IF NOT EXISTS "navegador" varchar(80);
ALTER TABLE "aparelhosConfiaveis" ADD COLUMN IF NOT EXISTS "ultimoUsoEm" timestamp with time zone;

-- Avisos de consulta que a pessoa quer receber por e-mail. Nulo = todos ligados
-- (o padrão de sempre). E-mails de segurança não passam por aqui.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avisosPorEmail" jsonb;
