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
MIGRATION_FILES=(
  "${ROOT_DIR}/drizzle/migrations/0016_ai_message_feedback.sql"
  "${ROOT_DIR}/drizzle/migrations/0017_ai_memory_audit.sql"
)

for migration_file in "${MIGRATION_FILES[@]}"; do
  if [[ ! -f "${migration_file}" ]]; then
    echo "Arquivo de migração não encontrado: ${migration_file}" >&2
    exit 1
  fi
done

printf '%s\n' "Validando conexão com o banco alvo..."
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc 'select current_database() || $$ / $$ || current_user;'
for migration_file in "${MIGRATION_FILES[@]}"; do
  printf '%s\n' "Aplicando $(basename "${migration_file}")..."
  psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "${migration_file}"
done
printf '%s\n' "Validando objetos criados..."
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc '
  select case
    when to_regclass('"'"'public."aiMessageFeedback"'"'"') is not null
      and to_regclass('"'"'public."aiMemories"'"'"') is not null
      and to_regclass('"'"'public."aiAuditEvents"'"'"') is not null
      and exists (select 1 from pg_type where typname = '"'"'ai_feedback_rating'"'"')
      and exists (select 1 from pg_type where typname = '"'"'ai_memory_scope'"'"')
    then '"'"'migration-ok'"'"'
    else '"'"'migration-incomplete'"'"'
  end;
' | grep -qx '"'"'migration-ok'"'"'
printf '%s\n' "Migrações aplicadas e verificadas."
