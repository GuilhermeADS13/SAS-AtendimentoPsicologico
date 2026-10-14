import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getOrCreateDevUser } from "../devAuth";
import { verifySupabaseToken } from "../supabaseAuth";
import { upsertUser, getUserByOpenId } from "../db";
import { registrarPedidoDoCadastro } from "../pedidoProfissional";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** Última sincronização da conta com o token do Supabase (openId → e-mail e quando). */
const ultimoSincronismo = new Map<string, { email: string | null; quando: number }>();

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // Autenticação: SÓ Supabase. O login OAuth do Manus foi removido — ele
  // validava um cookie/Bearer JWT assinado com JWT_SECRET (o mesmo segredo do
  // banco), então quem tivesse esse segredo forjava sessão de qualquer usuário,
  // inclusive admin. Como o cliente já usa 100% Supabase, era superfície de
  // ataque sem uso. Valida o Bearer token do Supabase e mapeia para users.
  {
    const authHeader = opts.req.headers["authorization"];
    const token =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
    if (token) {
      try {
        const sbUser = await verifySupabaseToken(token);
        if (sbUser) {
          const openId = `sb:${sbUser.sub}`;
          // Gravava no banco a CADA requisição (e o chat consulta a cada 2–5 s):
          // dobrava a carga do banco e tornava cada chamada mais cara num ataque.
          // Agora grava na 1ª vez, quando o e-mail muda ou a cada 5 min.
          const email = sbUser.email ?? null;
          const anterior = ultimoSincronismo.get(openId);
          const sincronizar = !anterior || anterior.email !== email || Date.now() - anterior.quando > 5 * 60_000;
          if (sincronizar) {
            await upsertUser({
              openId,
              email,
              name: sbUser.name ?? null,
              loginMethod: "supabase",
              lastSignedIn: new Date(),
            });
            if (ultimoSincronismo.size > 5000) ultimoSincronismo.clear();
            ultimoSincronismo.set(openId, { email, quando: Date.now() });
          }
          user = (await getUserByOpenId(openId)) ?? null;
          // Psicóloga que se cadastrou com CRP: o pedido de acesso sai no 1º login
          // confirmado (ver pedidoProfissional.ts). Junto da sincronização, não a
          // cada requisição.
          if (sincronizar && user && sbUser.crpSolicitado) {
            await registrarPedidoDoCadastro(user, sbUser.crpSolicitado).catch((e) =>
              console.warn("[TherapistRequest] pedido do cadastro falhou:", e instanceof Error ? e.message : e),
            );
          }
        }
      } catch (error) {
        console.warn("[SupabaseAuth] Falha ao validar token:", error);
      }
    }
  }

  // Login de DESENVOLVIMENTO: sem OAuth configurado, permite testar os fluxos
  // protegidos localmente. Só ativa com NODE_ENV=development E DEV_AUTH=true.
  if (!user && process.env.NODE_ENV === "development" && process.env.DEV_AUTH === "true") {
    try {
      user = await getOrCreateDevUser();
    } catch (error) {
      console.warn("[DevAuth] Falha ao criar usuário de desenvolvimento:", error);
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
