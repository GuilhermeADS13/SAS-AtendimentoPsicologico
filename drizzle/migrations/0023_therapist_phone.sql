-- Telefone da psicóloga, para a aba de Configurações.
--
-- O telefone já existia em `patients`, mas não em `therapists`: a psicóloga não
-- tinha onde guardar um contato próprio. Com a aba de Configurações servindo os
-- dois papéis, faltava esta coluna para o lado profissional.
--
-- Coluna NULA e aditiva: no Postgres, adicionar coluna nullable é instantâneo
-- (não reescreve a tabela) e não toca em nenhuma linha existente. Quem já usa o
-- sistema fica com NULL, exatamente como está hoje.
--
-- varchar(20) espelha `patients.phone`, para os dois lados aceitarem o mesmo
-- formato e a validação poder ser a mesma.

ALTER TABLE "therapists"
  ADD COLUMN IF NOT EXISTS "phone" varchar(20);
