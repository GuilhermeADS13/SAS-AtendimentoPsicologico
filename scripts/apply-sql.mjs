// Executa um arquivo .sql contra a DATABASE_URL (lida de .env.local/.env).
// Uso: node scripts/apply-sql.mjs supabase/policies/enable_rls.sql
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

const file = process.argv[2];
if (!file) {
  console.error("Uso: node scripts/apply-sql.mjs <caminho.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida (crie .env.local).");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = postgres(url, { prepare: false, max: 1 });

try {
  await client.unsafe(sql);
  console.log(`OK: ${file} aplicado com sucesso.`);
} catch (err) {
  // Não imprime a connection string (pode conter a senha).
  console.error(`Falha ao aplicar ${file}:`, err.message);
  process.exit(1);
} finally {
  await client.end();
}
