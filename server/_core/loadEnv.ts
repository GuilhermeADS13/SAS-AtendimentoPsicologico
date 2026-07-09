// Carrega variáveis de ambiente ANTES de qualquer módulo que as leia no import
// (ex.: _core/env.ts monta o objeto ENV no import-time). Este módulo é
// importado como primeiro import em _core/index.ts.
//
// Ordem: .env.local (dev) primeiro, depois .env — sem sobrescrever o que já
// existir no ambiente do processo.
import { config } from "dotenv";

config({ path: ".env.local" });
config();
