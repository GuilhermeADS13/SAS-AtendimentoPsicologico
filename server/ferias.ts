/**
 * Férias e folgas da psicóloga (2026-11-19). Regras puras em shared/ferias.ts. A busca
 * (server/conhecer.ts) esconde os horários de primeira conversa nos dias de férias e
 * recusa o pedido de um deles; as consultas já marcadas ela desmarca pela Agenda, com o
 * aviso de cancelamento de sempre.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { ferias, therapists } from "../drizzle/schema";
import { MAX_PERIODOS_DE_FERIAS, problemaNoPeriodo } from "../shared/ferias";
import { partesEmBrasilia } from "../shared/datas";
import { getDb } from "./db";
import { router, therapistProcedure } from "./_core/trpc";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha o dia.");
const hojeEmBrasilia = () => partesEmBrasilia(new Date()).data;

async function banco(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

async function idDaPsicologa(db: Db, userId: number): Promise<number> {
  const [t] = await db.select({ id: therapists.id }).from(therapists).where(eq(therapists.userId, userId)).limit(1);
  if (!t) throw new Error("Complete seu perfil profissional antes.");
  return t.id;
}

/** O horário cai em férias dela? Vale o dia de Brasília do início. */
export async function horarioEmFerias(db: Db, therapistId: number, inicio: Date): Promise<boolean> {
  const diaDoHorario = partesEmBrasilia(inicio).data;
  const [periodo] = await db
    .select({ id: ferias.id })
    .from(ferias)
    .where(and(eq(ferias.therapistId, therapistId), lte(ferias.inicio, diaDoHorario), gte(ferias.fim, diaDoHorario)))
    .limit(1);
  return !!periodo;
}

export const feriasRouter = router({
  /** Os períodos que ainda não acabaram, do mais próximo ao mais distante. */
  listar: therapistProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({ id: ferias.id, inicio: ferias.inicio, fim: ferias.fim })
      .from(ferias)
      .innerJoin(therapists, eq(therapists.id, ferias.therapistId))
      .where(and(eq(therapists.userId, ctx.user.id), gte(ferias.fim, hojeEmBrasilia())))
      .orderBy(asc(ferias.inicio));
  }),

  criar: therapistProcedure.input(z.object({ inicio: dia, fim: dia })).mutation(async ({ ctx, input }) => {
    const hoje = hojeEmBrasilia();
    const problema = problemaNoPeriodo(input, hoje);
    if (problema) throw new TRPCError({ code: "BAD_REQUEST", message: problema });
    const db = await banco();
    const therapistId = await idDaPsicologa(db, ctx.user.id);
    const [{ total }] = await db
      .select({ total: count() })
      .from(ferias)
      .where(and(eq(ferias.therapistId, therapistId), gte(ferias.fim, hoje)));
    if (total >= MAX_PERIODOS_DE_FERIAS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Você já tem ${MAX_PERIODOS_DE_FERIAS} períodos marcados. Apague um antes.` });
    }
    const [novo] = await db.insert(ferias).values({ therapistId, inicio: input.inicio, fim: input.fim }).returning({ id: ferias.id });
    return novo;
  }),

  remover: therapistProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const db = await banco();
    const therapistId = await idDaPsicologa(db, ctx.user.id);
    const apagados = await db
      .delete(ferias)
      .where(and(eq(ferias.id, input.id), eq(ferias.therapistId, therapistId)))
      .returning({ id: ferias.id });
    if (!apagados.length) throw new TRPCError({ code: "NOT_FOUND", message: "Esse período não existe mais." });
    return { ok: true } as const;
  }),
});
