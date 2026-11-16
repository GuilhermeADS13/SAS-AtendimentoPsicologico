-- Rede (2026-11-16): a psicóloga também encontra pacientes. O paciente que LIGA
-- "aparecer para psicólogas" entra num mural; ela convida para a primeira conversa
-- num horário dela, e ele aceita ou recusa. Só acrescenta; segura de reaplicar.

-- O paciente escolhe aparecer no mural (desligado por padrão: "o que te traz" pode ser
-- dado de saúde).
ALTER TABLE "perfisDePaciente" ADD COLUMN IF NOT EXISTS "noMural" boolean NOT NULL DEFAULT false;

-- Quem começou: 'paciente' (pediu um horário dela) ou 'psicologa' (convite pelo mural).
ALTER TABLE "pedidosParaConhecer" ADD COLUMN IF NOT EXISTS "origem" varchar(10) NOT NULL DEFAULT 'paciente';

-- Um pedido pendente por paciente vale só para o que ELE pede: convites de psicólogas
-- diferentes podem chegar ao mesmo tempo.
DROP INDEX IF EXISTS "pedidosParaConhecer_paciente_pendente";
CREATE UNIQUE INDEX IF NOT EXISTS "pedidosParaConhecer_paciente_pendente" ON "pedidosParaConhecer" ("pacienteUserId")
  WHERE "status" = 'pendente' AND "origem" = 'paciente';
-- Cada psicóloga tem no máximo um convite pendente para a mesma pessoa.
CREATE UNIQUE INDEX IF NOT EXISTS "pedidosParaConhecer_convite_pendente" ON "pedidosParaConhecer" ("therapistId", "pacienteUserId")
  WHERE "status" = 'pendente' AND "origem" = 'psicologa';
