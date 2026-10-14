import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/**
 * O erro veio do BANCO (e não de uma regra nossa)? O Drizzle embrulha a falha em
 * "Failed query: <SQL>\nparams: <valores>" — e esse texto ia direto para o
 * navegador como mensagem, mostrando a estrutura das tabelas e os valores da
 * consulta. Os erros que nós lançamos de propósito ("Consulta não encontrada")
 * continuam passando, porque a tela mostra essas mensagens.
 */
export function ehErroDeBanco(erro: unknown): boolean {
  for (let e: unknown = erro, i = 0; e && i < 5; e = (e as { cause?: unknown }).cause, i++) {
    const { message, code, name } = e as { message?: unknown; code?: unknown; name?: unknown };
    if (typeof message === "string" && /^Failed query:/i.test(message)) return true;
    if (name === "DrizzleQueryError" || name === "PostgresError" || name === "DatabaseError") return true;
    // Código SQLSTATE do Postgres (ex.: 23505, 22P02).
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) && /^[0-9]{2}/.test(code)) return true;
  }
  return false;
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (error.code === "INTERNAL_SERVER_ERROR" && ehErroDeBanco(error)) {
      return { ...shape, message: "Erro interno. Tente de novo em instantes." };
    }
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * Acesso clínico (prontuários, agendamentos, sessões, documentos).
 * Só a psicóloga: `admin` ou `therapist`. Pacientes (`user`/`patient`) recebem
 * FORBIDDEN — eles só têm o próprio perfil e a videochamada.
 */
export const therapistProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }

    if (ctx.user.role !== "admin" && ctx.user.role !== "therapist") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Acesso restrito à psicóloga.",
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
