#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL não está definida; migração abortada." >&2
  exit 1
fi

if [[ "${DATABASE_URL}" == *"<"* || "${DATABASE_URL}" == *">"* || "${DATABASE_URL}" == *"PASSWORD"* ]]; then
  echo "DATABASE_URL parece conter um placeholder; migração abortada." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="${ROOT_DIR}/drizzle/migrations/0016_ai_message_feedback.sql"

if [[ ! -f "${MIGRATION_FILE}" ]]; then
  echo "Arquivo de migração não encontrado: ${MIGRATION_FILE}" >&2
  exit 1
fi

printf '%s\n' "Validando conexão com o banco alvo..."
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc 'select current_database() || $$ / $$ || current_user;'
printf '%s\n' "Aplicando migração 0016..."
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${MIGRATION_FILE}"
printf '%s\n' "Validando objetos criados..."
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc '
  select case
    when to_regclass('"'"'public."aiMessageFeedback"'"'"') is not null
      and exists (select 1 from pg_type where typname = '"'"'ai_feedback_rating'"'"')
    then '"'"'migration-ok'"'"'
    else '"'"'migration-incomplete'"'"'
  end;
' | grep -qx 'migration-ok'
printf '%s\n' "Migração aplicada e verificada."
