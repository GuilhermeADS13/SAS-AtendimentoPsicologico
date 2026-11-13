-- Encontrar uma psicóloga (2026-11-13): busca pública de psicólogas, perfil do paciente
-- e pedido de "primeira conversa" (curta e gratuita) num horário que a psicóloga abriu.
-- Só acrescenta colunas e tabelas novas; nada existente muda. Segura de reaplicar.

-- Perfil público da psicóloga. Ela escolhe aparecer ("naBusca", desligado por padrão).
-- O valor da sessão NÃO entra no perfil público (Código de Ética, art. 20, d).
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "naBusca" boolean NOT NULL DEFAULT false;
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "abordagem" varchar(200);
-- 'online' | 'presencial' | 'ambos'
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "modalidade" varchar(12);
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "cidade" varchar(80);
ALTER TABLE "therapists" ADD COLUMN IF NOT EXISTS "uf" varchar(2);

-- Horários que a psicóloga abre para a primeira conversa. O paciente escolhe um.
CREATE TABLE IF NOT EXISTS "horariosParaConhecer" (
  "id" serial PRIMARY KEY,
  "therapistId" integer NOT NULL REFERENCES "therapists"("id") ON DELETE CASCADE,
  "inicio" timestamp with time zone NOT NULL,
  "duracao" smallint NOT NULL DEFAULT 20,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "horariosParaConhecer_psicologa_inicio" ON "horariosParaConhecer" ("therapistId", "inicio");

-- Perfil do paciente que procura uma psicóloga. "oQueProcura" só aparece para a psicóloga
-- a quem ele pede o horário (dado sensível: nunca na busca pública).
CREATE TABLE IF NOT EXISTS "perfisDePaciente" (
  "userId" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "cidade" varchar(80),
  "uf" varchar(2),
  "nascimento" date,
  "modalidade" varchar(12),
  "oQueProcura" text,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
);

-- Pedido de primeira conversa. status: 'pendente' | 'aceito' | 'recusado' | 'cancelado' | 'expirado'.
-- "inicio" e "duracao" são cópia do horário: o histórico sobrevive se o horário sair.
CREATE TABLE IF NOT EXISTS "pedidosParaConhecer" (
  "id" serial PRIMARY KEY,
  "horarioId" integer REFERENCES "horariosParaConhecer"("id") ON DELETE SET NULL,
  "therapistId" integer NOT NULL REFERENCES "therapists"("id") ON DELETE CASCADE,
  "pacienteUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "inicio" timestamp with time zone NOT NULL,
  "duracao" smallint NOT NULL DEFAULT 20,
  "mensagem" text,
  "status" varchar(12) NOT NULL DEFAULT 'pendente',
  "patientId" integer REFERENCES "patients"("id") ON DELETE SET NULL,
  "appointmentId" integer REFERENCES "appointments"("id") ON DELETE SET NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "respondidoEm" timestamp with time zone
);
-- Um horário só tem um pedido em aberto (ou aceito) por vez.
CREATE UNIQUE INDEX IF NOT EXISTS "pedidosParaConhecer_horario_ativo" ON "pedidosParaConhecer" ("horarioId")
  WHERE "status" IN ('pendente', 'aceito');
-- Cada paciente tem no máximo um pedido esperando resposta.
CREATE UNIQUE INDEX IF NOT EXISTS "pedidosParaConhecer_paciente_pendente" ON "pedidosParaConhecer" ("pacienteUserId")
  WHERE "status" = 'pendente';
CREATE INDEX IF NOT EXISTS "pedidosParaConhecer_psicologa" ON "pedidosParaConhecer" ("therapistId");

-- Como as outras tabelas: a API pública do Supabase não lê nem escreve; só o servidor.
ALTER TABLE "horariosParaConhecer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "perfisDePaciente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidosParaConhecer" ENABLE ROW LEVEL SECURITY;
