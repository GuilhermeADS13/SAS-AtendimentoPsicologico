-- Tour de boas-vindas da Luma: marca por CONTA, não por navegador.
--
-- A primeira versão guardava "já viu" no localStorage, que é por navegador/perfil:
-- a mesma pessoa, no mesmo login, via o tour de novo ao trocar de navegador ou de
-- dispositivo. Com a marca aqui, a conta vê o tour uma única vez em qualquer lugar.
--
-- Coluna NULA: no Postgres adicionar coluna nullable é instantâneo (não reescreve
-- a tabela) e não toca em nenhuma linha existente — quem já usa o sistema fica com
-- NULL e simplesmente veria o tour uma vez.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "onboardingSeenAt" timestamp with time zone;
