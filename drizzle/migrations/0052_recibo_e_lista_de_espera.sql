-- Recibo de pagamento e lista de espera (2026-11-09).
-- Só acrescenta colunas que aceitam nulo e uma tabela nova; segura de reaplicar.

-- Recibo que vale para o Imposto de Renda: pede CPF e endereço de quem atende e o CPF
-- do paciente. Ficam opcionais: sem eles, o recibo sai e avisa o que falta.
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "cpf" varchar(14);
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "endereco" text;
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "cpf" varchar(14);

-- Lista de espera: quem quer um horário com a psicóloga e quando. Quando uma consulta
-- é desmarcada, a tela mostra quem da lista quer aquele dia e período.
-- diasDaSemana: 0 = domingo ... 6 = sábado. periodos: 'manha', 'tarde', 'noite'.
CREATE TABLE IF NOT EXISTS "listaDeEspera" (
  "id" serial PRIMARY KEY,
  "therapistId" integer NOT NULL REFERENCES "therapists"("id") ON DELETE CASCADE,
  "patientId" integer NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "diasDaSemana" smallint[] NOT NULL DEFAULT '{}',
  "periodos" text[] NOT NULL DEFAULT '{}',
  "observacao" text,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "listaDeEspera_psicologa_paciente" ON "listaDeEspera" ("therapistId", "patientId");

-- Como as outras tabelas: a API pública do Supabase não lê nem escreve; só o servidor.
ALTER TABLE "listaDeEspera" ENABLE ROW LEVEL SECURITY;
