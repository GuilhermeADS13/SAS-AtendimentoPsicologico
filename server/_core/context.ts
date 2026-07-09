import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getOrCreateDevUser } from "../devAuth";
import { verifySupabaseToken } from "../supabaseAuth";
import { upsertUser, getUserByOpenId } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Supabase Auth: valida o Bearer token (JWT) e mapeia para a nossa tabela users.
  if (!user) {
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
          await upsertUser({
            openId,
            email: sbUser.email ?? null,
            name: sbUser.name ?? null,
            loginMethod: "supabase",
            lastSignedIn: new Date(),
          });
          user = (await getUserByOpenId(openId)) ?? null;
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
