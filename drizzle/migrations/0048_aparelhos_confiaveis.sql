-- Verificação de aparelho novo (psicóloga e admin): o código enviado por e-mail e
-- os aparelhos que já passaram por ele. Só o servidor lê: RLS ligada, sem política.
CREATE TABLE IF NOT EXISTS "codigosDeAparelho" (
  "userId" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "codigoHash" varchar(64) NOT NULL,
  "expiraEm" timestamp with time zone NOT NULL,
  "tentativas" smallint NOT NULL DEFAULT 0
);
ALTER TABLE "codigosDeAparelho" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "aparelhosConfiaveis" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tokenHash" varchar(64) NOT NULL UNIQUE,
  "expiraEm" timestamp with time zone NOT NULL,
  "criadoEm" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "aparelhosConfiaveis_userId_idx" ON "aparelhosConfiaveis" ("userId");
ALTER TABLE "aparelhosConfiaveis" ENABLE ROW LEVEL SECURITY;
