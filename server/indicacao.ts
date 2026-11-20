/**
 * Indique uma colega (shared/indicacao.ts): quantas colegas criaram conta pelo link de
 * cada psicóloga e quantas já pagaram, e a lista para o suporte lançar o mês grátis.
 *
 * A origem do cadastro fica nos dados da conta do Supabase (auth.users,
 * raw_user_meta_data->>'origem'), não no banco do app. Melhor esforço: num banco sem o
 * esquema auth (o de teste local) devolve null, e a tela mostra só o link.
 */
import { inArray, sql } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { origemDeIndicacao, quemIndicou } from "../shared/indicacao";
import { getDb } from "./db";
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
  nome: string | null;
  email: string | null;
  criadaEm: Date;
  aprovada: boolean;
  pagou: boolean;
  origem: string;
  quemIndicou: { id: number; nome: string | null } | null;
};

type Linha = { nome: string | null; email: string | null; criada_em: Date | string; aprovada: boolean; pagou: boolean; origem: string };

/** Para o suporte: quem criou conta por link de indicação (o novo e os "indicacao-<nome>" manuais). */
export async function listarIndicacoes(): Promise<Indicacao[] | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    const linhas = (await db.execute(sql`
      select coalesce(u.name, au.raw_user_meta_data->>'name') as nome,
             coalesce(u.email, au.email) as email,
             au.created_at as criada_em,
             (t.id is not null) as aprovada,
             (a."pagoAte" is not null) as pagou,
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
        nome: l.nome,
        email: l.email,
        criadaEm: new Date(l.criada_em),
        aprovada: l.aprovada,
        pagou: l.pagou,
        origem: l.origem,
        quemIndicou: id !== null ? { id, nome: nomes.get(id) ?? null } : null,
      };
    });
  } catch (e) {
    console.warn("[Indicação] não deu para listar:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const indicacaoRouter = router({
  /** O código do link dela e, se der para ler, quantas criaram conta e quantas assinaram. */
  minha: therapistProcedure.query(async ({ ctx }) => ({
    origem: origemDeIndicacao(ctx.user.id),
    contagem: await contarIndicacoes(ctx.user.id),
  })),
});
