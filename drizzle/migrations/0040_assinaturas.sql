-- Assinatura de cada psicóloga (preço por paciente, pago por Pix — ver
-- shared/precos.ts e shared/assinatura.ts).
--
-- "testeAte": fim dos 14 dias grátis; nulo = não ganhou teste (o CRP ou o
-- celular já tinham usado um). "pagoAte": até quando o Pix cobre. Liberado
-- enquanto um dos dois estiver no futuro.
--
-- CRP e celular ficam aqui (só dígitos) para barrar um segundo teste grátis com
-- conta nova. Por isso "therapistId" é SET NULL, e não CASCADE: apagar a conta
-- não pode apagar o registro de que aquele CRP/celular já usou o teste.
-- Tabela nova; nada existente muda. Segura de reaplicar.
CREATE TABLE IF NOT EXISTS "assinaturas" (
  "id" serial PRIMARY KEY,
  "therapistId" integer UNIQUE REFERENCES "therapists"("id") ON DELETE SET NULL,
  "crp" varchar(64) NOT NULL,
  "celular" varchar(20),
  "testeAte" timestamptz,
  "pagoAte" timestamptz,
  "ciclo" varchar(10) DEFAULT 'mensal' NOT NULL,
  "fundador" boolean DEFAULT false NOT NULL,
  "createdAt" timestamptz DEFAULT now() NOT NULL,
  "updatedAt" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "assinaturas_crp_idx" ON "assinaturas" ("crp");
CREATE INDEX IF NOT EXISTS "assinaturas_celular_idx" ON "assinaturas" ("celular");

-- Quem já é psicóloga hoje (decisão de 2026-10-26): 14 dias a partir de agora e
-- vaga de fundadora (20% para sempre).
INSERT INTO "assinaturas" ("therapistId", "crp", "celular", "testeAte", "fundador")
SELECT t."id",
       regexp_replace(t."crp", '[^0-9]', '', 'g'),
       NULLIF(regexp_replace(coalesce(t."phone", ''), '[^0-9]', '', 'g'), ''),
       now() + interval '14 days',
       true
FROM "therapists" t
ON CONFLICT ("therapistId") DO NOTHING;

-- Como as outras tabelas: RLS ligada e SEM políticas. O app acessa pelo backend;
-- a API pública do Supabase não enxerga nada desta tabela.
ALTER TABLE "assinaturas" ENABLE ROW LEVEL SECURITY;
