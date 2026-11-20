/**
 * Indique uma colega contra o Postgres real: a contagem da psicóloga e a lista do
 * suporte leem a origem do cadastro em auth.users (dados da conta do Supabase).
 *
 * O banco de teste do CI não tem o esquema auth do Supabase: o teste cria um auth.users
 * mínimo (e apaga no fim). Num Supabase local, usa o de verdade e apaga só as suas linhas.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { origemDeIndicacao } from "../shared/indicacao";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { QUEM_INDICA: 990701, PAGOU: 990702, ADMIN: 990703 } as const;
const UID = { pagou: randomUUID(), soCriou: randomUUID(), outraOrigem: randomUUID() };

function ctx(userId: number, role: "therapist" | "admin"): TrpcContext {
  return {
    user: {
      id: userId, openId: `sb:indica-${userId}`, email: `indica-${userId}@teste.local`, name: `Pessoa ${userId}`,
      loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

describe.runIf(RUN)("indique uma colega (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  let criouATabela = false;
  const origem = origemDeIndicacao(ID.QUEM_INDICA);

  async function limpar() {
    const [t] = await sql`select id from therapists where "userId" = ${ID.PAGOU}`;
    if (t) {
      await sql`delete from assinaturas where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    const [existe] = await sql`select to_regclass('auth.users') as tabela`;
    if (!existe.tabela) {
      await sql`create schema if not exists auth`;
      await sql`create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), raw_user_meta_data jsonb)`;
      criouATabela = true;
    }
    await limpar();
    await sql`insert into users (id, "openId", name, email, role) values
      (${ID.QUEM_INDICA}, ${`sb:indica-${ID.QUEM_INDICA}`}, 'Quem Indica', 'quem-indica@teste.local', 'therapist'),
      (${ID.PAGOU}, ${`sb:${UID.pagou}`}, 'Colega Que Pagou', 'colega-pagou@teste.local', 'therapist'),
      (${ID.ADMIN}, ${`sb:indica-${ID.ADMIN}`}, 'Suporte', 'suporte-indica@teste.local', 'admin')`;
    const [t] = await sql`insert into therapists ("userId", crp) values (${ID.PAGOU}, 'INDICA-01') returning id`;
    await sql`insert into assinaturas ("therapistId", crp, "pagoAte") values (${t.id}, 'INDICA01', now() + interval '30 days')`;
    await sql`insert into auth.users (id, email, raw_user_meta_data) values
      (${UID.pagou}, 'colega-pagou@teste.local', ${sql.json({ name: "Colega Que Pagou", origem })}),
      (${UID.soCriou}, 'colega-so-criou@teste.local', ${sql.json({ name: "Colega Só Criou", origem })}),
      (${UID.outraOrigem}, 'veio-do-insta@teste.local', ${sql.json({ name: "Veio do Insta", origem: "instagram" })})`;
  });

  afterAll(async () => {
    if (!sql) return;
    await sql`delete from auth.users where id in ${sql(Object.values(UID))}`;
    if (criouATabela) await sql`drop table auth.users`;
    await limpar();
    await sql.end();
  });

  it("a psicóloga vê quantas criaram conta pelo link dela e quantas pagaram", async () => {
    const minha = await appRouter.createCaller(ctx(ID.QUEM_INDICA, "therapist")).indicacao.minha();
    expect(minha).toEqual({ origem, contagem: { criaram: 2, assinaram: 1 } });
  });

  it("o suporte vê quem indicou quem e quem já pagou", async () => {
    const lista = (await appRouter.createCaller(ctx(ID.ADMIN, "admin")).admin.indicacoes()) ?? [];
    const daqui = lista.filter((i) => i.origem === origem);
    expect(daqui).toHaveLength(2);
    expect(daqui.find((i) => i.email === "colega-pagou@teste.local")).toMatchObject({
      nome: "Colega Que Pagou",
      aprovada: true,
      pagou: true,
      quemIndicou: { id: ID.QUEM_INDICA, nome: "Quem Indica" },
    });
    expect(daqui.find((i) => i.email === "colega-so-criou@teste.local")).toMatchObject({ nome: "Colega Só Criou", aprovada: false, pagou: false });
    expect(lista.some((i) => i.origem === "instagram")).toBe(false);
  });
});
