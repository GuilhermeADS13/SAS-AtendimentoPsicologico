// Carrega variáveis de ambiente ANTES de qualquer módulo que as leia no import
// (ex.: _core/env.ts monta o objeto ENV no import-time). Este módulo é
// importado como primeiro import em _core/index.ts.
//
// Ordem: .env.local (dev) primeiro, depois .env — sem sobrescrever o que já
// existir no ambiente do processo.
//
// ENV_FILE troca o .env.local por outro arquivo. O `pnpm dev:local` usa
// .env.supabase.local, que aponta para o Supabase no Docker: o .env.local aponta
// para o banco de PRODUÇÃO. As VITE_* lidas aqui também valem para o front, porque
// o Vite não sobrescreve o que já está no ambiente do processo.
import { config } from "dotenv";

config({ path: process.env.ENV_FILE || ".env.local" });
config();
