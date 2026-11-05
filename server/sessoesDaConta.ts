import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { nomeDoNavegador } from "../shared/navegador";

/**
 * Aparelhos conectados de quem NÃO confirma aparelho por código (paciente): são as
 * sessões abertas no Supabase Auth, que guardam o navegador de cada login. A
 * psicóloga e o admin continuam vendo os aparelhos confirmados (server/aparelhos.ts).
 */
export type SessaoDaConta = { id: string; navegador: string; criadaEm: Date; ultimoUso: Date; estaSessao: boolean };

type Linha = { id: string; user_agent: string | null; created_at: Date | string; ultimo: Date | string };

/** session_id do token DESTA chamada. O token já foi validado em createContext; aqui só se lê o campo. */
export function sessaoDoToken(authorization: unknown): string | null {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  try {
    const corpo = authorization.slice(7).split(".")[1] ?? "";
    const payload = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : null;
  } catch {
    return null;
  }
}

export function montarSessoes(linhas: Linha[], sessaoAtual: string | null): SessaoDaConta[] {
  return linhas.map((l) => ({
    id: l.id,
    navegador: nomeDoNavegador(l.user_agent),
    criadaEm: new Date(l.created_at),
    ultimoUso: new Date(l.ultimo),
    estaSessao: l.id === sessaoAtual,
  }));
}

export async function listarSessoes(authUid: string, sessaoAtual: string | null): Promise<SessaoDaConta[]> {
  const db = await getDb();
  if (!db) return [];
  // refreshed_at é "timestamp" sem fuso, gravado em UTC.
  const linhas = (await db.execute(sql`
    select id, user_agent, created_at,
           greatest(created_at, updated_at, coalesce(refreshed_at at time zone 'UTC', created_at)) as ultimo
      from auth.sessions
     where user_id = ${authUid}::uuid and (not_after is null or not_after > now())
     order by ultimo desc
     limit 20`)) as unknown as Linha[];
  return montarSessoes(linhas, sessaoAtual);
}

/** Encerra uma sessão da PRÓPRIA conta: o aparelho perde o login na próxima renovação do token (até 1 h). */
export async function encerrarSessao(authUid: string, id: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const apagadas = (await db.execute(sql`
    delete from auth.sessions where id = ${id}::uuid and user_id = ${authUid}::uuid returning id`)) as unknown as unknown[];
  return apagadas.length > 0;
}
