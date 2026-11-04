#!/usr/bin/env sh
# Aplica TODAS as migrações de drizzle/migrations/ no Postgres de TESTE, em ordem.
#
# Antes o CI aplicava uma lista escrita à mão, que parou na 0032: as colunas das
# migrações seguintes não existiam no banco de teste e o teste de integração quebrou
# em 21/10/2026 (CI vermelho desde então). Com a pasta inteira, migração nova entra
# sozinha.
#
# Ficam de fora só as que dependem de objetos que existem apenas no Supabase
# (permissões dos papéis anon/authenticated, Storage e pg_cron). Uma migração nova
# desse tipo precisa entrar em PULAR, com o motivo.
#
# Uso: DATABASE_URL=postgresql://... sh scripts/migracoes-de-teste.sh
#      (PSQL="docker exec -i <container> psql" para usar o psql de um container)
set -eu

: "${DATABASE_URL:?defina DATABASE_URL}"
PSQL="${PSQL:-psql}"

# 0024 e 0031: permissões dos papéis do Supabase em funções do Storage
# 0034 e 0049: bucket e regras do Storage
# 0035 e 0036: agendador pg_cron/pg_net que acorda o Render
PULAR="0024_ 0031_ 0034_ 0035_ 0036_ 0049_"

for arquivo in drizzle/migrations/*.sql; do
  nome=$(basename "$arquivo")
  pular=""
  for prefixo in $PULAR; do
    case "$nome" in "$prefixo"*) pular=1 ;; esac
  done
  if [ -n "$pular" ]; then
    echo "pulando $nome (só existe no Supabase)"
    continue
  fi
  echo "aplicando $nome"
  $PSQL "$DATABASE_URL" -v ON_ERROR_STOP=1 -q < "$arquivo"
done
