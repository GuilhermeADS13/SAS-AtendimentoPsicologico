/**
 * Indique uma colega (shared/indicacao.ts): quantas colegas criaram conta pelo link de
 * cada psicóloga e quantas já pagaram, e a lista para o suporte lançar o mês grátis.
 *
 * A origem do cadastro fica nos dados da conta do Supabase (auth.users,
 * raw_user_meta_data->>'origem'), não no banco do app. Melhor esforço: num banco sem o
 * esquema auth (o de teste local) devolve null, e a tela mostra só o link.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { assinaturas, therapists, users } from "../drizzle/schema";
import { origemDeIndicacao, quemIndicou } from "../shared/indicacao";
import { novoPagoAte } from "../shared/assinatura";
import { getDb } from "./db";
import { uidSupabase } from "./storageKeys";
import { router, therapistProcedure } from "./_core/trpc";

type Contagem = { criaram: number; assinaram: number };

export async function contarIndicacoes(userId: number): Promise<Contagem | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const [linha] = (await db.execute(sql`
      select count(*)::int as "criaram", count(a."pagoAte")::int as "assinaram"
        from auth.users au
        left join users u on u."openId" = 'sb:' || au.id::text
        left join therapists t on t."userId" = u.id
        left join assinaturas a on a."therapistId" = t.id
       where au.raw_user_meta_data->>'origem' = ${origemDeIndicacao(userId)}`)) as unknown as Contagem[];
    return { criaram: linha?.criaram ?? 0, assinaram: linha?.assinaram ?? 0 };
  } catch (e) {
    console.warn("[Indicação] não deu para contar:", e instanceof Error ? e.message : e);
    return null;
  }
}

export type Indicacao = {
  /** Conta da indicada no app (null se ela ainda não entrou depois de criar a conta). */
  userId: number | null;
  nome: string | null;
  email: string | null;
  criadaEm: Date;
  aprovada: boolean;
  pagou: boolean;
  /** Quando o suporte lançou o mês grátis das duas (null = ainda não). */
  mesLancadoEm: Date | null;
  origem: string;
  quemIndicou: { id: number; nome: string | null } | null;
};

type Linha = {
  user_id: number | null;
  nome: string | null;
  email: string | null;
  criada_em: Date | string;
  aprovada: boolean;
  pagou: boolean;
  mes_lancado_em: Date | string | null;
  origem: string;
};

/** Para o suporte: quem criou conta por link de indicação (o novo e os "indicacao-<nome>" manuais). */
export async function listarIndicacoes(): Promise<Indicacao[] | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const linhas = (await db.execute(sql`
      select u.id as user_id,
             coalesce(u.name, au.raw_user_meta_data->>'name') as nome,
             coalesce(u.email, au.email) as email,
             au.created_at as criada_em,
             (t.id is not null) as aprovada,
             (a."pagoAte" is not null) as pagou,
             a."mesDaIndicacaoEm" as mes_lancado_em,
             au.raw_user_meta_data->>'origem' as origem
        from auth.users au
        left join users u on u."openId" = 'sb:' || au.id::text
        left join therapists t on t."userId" = u.id
        left join assinaturas a on a."therapistId" = t.id
       where au.raw_user_meta_data->>'origem' like 'ind-%'
          or au.raw_user_meta_data->>'origem' like 'indicacao-%'
       order by au.created_at desc
       limit 200`)) as unknown as Linha[];
    const ids = Array.from(new Set(linhas.map((l) => quemIndicou(l.origem)).filter((id): id is number => id !== null)));
    const nomes = new Map<number, string | null>();
    if (ids.length) {
      for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids))) nomes.set(u.id, u.name);
    }
    return linhas.map((l) => {
      const id = quemIndicou(l.origem);
      return {
        userId: l.user_id,
        nome: l.nome,
        email: l.email,
        criadaEm: new Date(l.criada_em),
        aprovada: l.aprovada,
        pagou: l.pagou,
        mesLancadoEm: l.mes_lancado_em ? new Date(l.mes_lancado_em) : null,
        origem: l.origem,
        quemIndicou: id !== null ? { id, nome: nomes.get(id) ?? null } : null,
      };
    });
  } catch (e) {
    console.warn("[Indicação] não deu para listar:", e instanceof Error ? e.message : e);
    return null;
  }
}

const recusa = (message: string) => new TRPCError({ code: "BAD_REQUEST", message });

/**
 * O mês grátis da indicação (regra de 17/11): soma 1 mês à assinatura da indicada e à de
 * quem indicou, sem mudar o ciclo (o "Registrar Pix" troca o ciclo, por isso não serve).
 * Só depois que a indicada pagou, e uma vez por indicação: a marca fica na assinatura dela,
 * gravada antes das somas e só se ainda estiver vazia (clique duplo não dá dois meses).
 */
export async function darMesDaIndicacao(indicadaUserId: number): Promise<{ indicada: Date; quemIndicou: Date }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const assinaturaDe = async (userId: number) => {
    const [linha] = await db
      .select({ id: assinaturas.id, testeAte: assinaturas.testeAte, pagoAte: assinaturas.pagoAte, diaVencimento: assinaturas.diaVencimento, mesDaIndicacaoEm: assinaturas.mesDaIndicacaoEm })
      .from(assinaturas)
      .innerJoin(therapists, eq(therapists.id, assinaturas.therapistId))
      .where(eq(therapists.userId, userId))
      .limit(1);
    return linha ?? null;
  };

  const [indicada] = await db.select({ openId: users.openId }).from(users).where(eq(users.id, indicadaUserId)).limit(1);
  const uid = uidSupabase(indicada?.openId);
  // Conta sem login do Supabase (antiga ou de teste) não tem cadastro em auth.users.
  if (!uid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
    throw recusa("Conta da indicada não encontrada.");
  }
  const [cadastro] = (await db.execute(sql`select raw_user_meta_data->>'origem' as origem from auth.users where id = ${uid}::uuid`)) as unknown as { origem: string | null }[];
  const quemIndicouId = quemIndicou(cadastro?.origem);
  if (!quemIndicouId) throw recusa("Essa conta não veio de um link de indicação.");
  if (quemIndicouId === indicadaUserId) throw recusa("A conta indicou a si mesma.");

  const daIndicada = await assinaturaDe(indicadaUserId);
  if (!daIndicada?.pagoAte) throw recusa("A indicada ainda não pagou: o mês só vale depois do primeiro pagamento dela.");
  if (daIndicada.mesDaIndicacaoEm) throw recusa("O mês dessa indicação já foi lançado.");
  const deQuemIndicou = await assinaturaDe(quemIndicouId);
  if (!deQuemIndicou) throw recusa("Quem indicou ainda não tem assinatura.");

  return db.transaction(async (tx) => {
    const marcadas = await tx
      .update(assinaturas)
      .set({ mesDaIndicacaoEm: new Date() })
      .where(and(eq(assinaturas.id, daIndicada.id), isNull(assinaturas.mesDaIndicacaoEm)))
      .returning({ id: assinaturas.id });
    if (!marcadas.length) throw recusa("O mês dessa indicação já foi lançado.");
    const indicadaAte = novoPagoAte(daIndicada, "mensal");
    const quemIndicouAte = novoPagoAte(deQuemIndicou, "mensal");
    await tx.update(assinaturas).set({ pagoAte: indicadaAte }).where(eq(assinaturas.id, daIndicada.id));
    await tx.update(assinaturas).set({ pagoAte: quemIndicouAte }).where(eq(assinaturas.id, deQuemIndicou.id));
    console.info(`[Indicação] mês lançado: conta ${indicadaUserId} e conta ${quemIndicouId}.`);
    return { indicada: indicadaAte, quemIndicou: quemIndicouAte };
  });
}

export const indicacaoRouter = router({
  /** O código do link dela e, se der para ler, quantas criaram conta e quantas assinaram. */
  minha: therapistProcedure.query(async ({ ctx }) => ({
    origem: origemDeIndicacao(ctx.user.id),
    contagem: await contarIndicacoes(ctx.user.id),
  })),
});
