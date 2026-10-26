-- Paciente paga a consulta por Pix DIRETO para a psicóloga (o VozInterior não
-- toca no dinheiro). A psicóloga cadastra a chave; o "copia e cola" com o valor
-- de cada consulta é montado na hora (shared/pix.ts).
-- "pagamentoInformadoEm": o paciente tocou em "Já paguei". Só vira "pago" quando
-- a psicóloga confirma (decisão de 2026-10-26).
-- Só adiciona colunas vazias; nada existente muda.
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "pixTipo" varchar(12);
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "pixChave" varchar(77);
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "pixCidade" varchar(15);
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "pagamentoInformadoEm" timestamptz;
