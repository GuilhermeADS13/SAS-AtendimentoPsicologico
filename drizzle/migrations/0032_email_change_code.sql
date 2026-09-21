-- Troca de e-mail por CÓDIGO (fluxo próprio do app, sem depender do e-mail do
-- Supabase, que exige SMTP customizado para editar template). Guarda o e-mail
-- novo pendente, o HASH do código enviado (para os dois e-mails), a expiração e
-- o nº de tentativas. Colunas aditivas e seguras de reaplicar.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailChangeNew" varchar(320);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailChangeCodeHash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailChangeExpires" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailChangeAttempts" integer NOT NULL DEFAULT 0;
