/**
 * Consultas para o arquivo do Receita Saúde (appointments.recibosParaReceitaSaude), contra
 * o Postgres real: só as pagas e com valor, do ano pedido (pelo pagamento ou pela sessão),
 * e só as da própria psicóloga.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990501, B: 990502 } as const;

function ctx(userId: number): TrpcContext {
  return {
    user: {
      id: userId, openId: `sb:receita-${userId}`, email: `receita-${userId}@teste.local`, name: `Psicóloga ${userId}`,
      loginMethod: "test", role: "therapist", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

describe.runIf(RUN)("consultas para o Receita Saúde (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const consulta: Record<string, number> = {};

  async function limpar() {
    for (const userId of Object.values(ID)) {
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      if (!t) continue;
      await sql`delete from appointments where "therapistId" = ${t.id}`;
      await sql`delete from patients where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    const terapeuta: Record<number, number> = {};
    for (const id of Object.values(ID)) {
      await sql`insert into users (id, "openId", name, email, role) values (${id}, ${`sb:receita-${id}`}, ${`Psicóloga ${id}`}, ${`receita-${id}@teste.local`}, 'therapist')`;
      const [t] = await sql`insert into therapists ("userId", crp) values (${id}, ${`RECEITA-${id}`}) returning id`;
      terapeuta[id] = t.id;
    }
    const paciente = async (therapistId: number, nome: string, cpf: string | null) =>
      (await sql`insert into patients ("therapistId", "firstName", "lastName", email, cpf)
                 values (${therapistId}, ${nome}, 'Teste', ${`${nome.toLowerCase()}-receita@teste.local`}, ${cpf}) returning id`)[0].id as number;
    const ana = await paciente(terapeuta[ID.A], "Ana", "11144477735");
    const bia = await paciente(terapeuta[ID.A], "Bia", null);
    const caio = await paciente(terapeuta[ID.B], "Caio", "12345678909");
    const marcar = async (nome: string, therapistId: number, patientId: number, quando: string, extra: { price: number; paid: boolean; paidAt?: string; informado?: string }) => {
      const [c] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", price, paid, "paidAt", "pagamentoInformadoEm")
                            values (${therapistId}, ${patientId}, ${quando}, ${extra.price}, ${extra.paid}, ${extra.paidAt ?? null}, ${extra.informado ?? null})
                            returning id`;
      consulta[nome] = c.id;
    };
    await marcar("marco", terapeuta[ID.A], ana, "2026-03-10T13:00:00Z", { price: 15000, paid: true, paidAt: "2026-03-12T15:00:00Z", informado: "2026-03-11T12:00:00Z" });
    // Sessão de dezembro paga em janeiro: entra no ano do pagamento E no da sessão.
    await marcar("virada", terapeuta[ID.A], ana, "2025-12-30T13:00:00Z", { price: 15000, paid: true, informado: "2026-01-02T12:00:00Z" });
    await marcar("semValor", terapeuta[ID.A], bia, "2026-05-05T13:00:00Z", { price: 0, paid: true, paidAt: "2026-05-05T15:00:00Z" });
    await marcar("naoPaga", terapeuta[ID.A], bia, "2026-05-06T13:00:00Z", { price: 20000, paid: false });
    await marcar("antiga", terapeuta[ID.A], ana, "2024-06-01T13:00:00Z", { price: 15000, paid: true, paidAt: "2024-06-02T13:00:00Z" });
    await marcar("daOutra", terapeuta[ID.B], caio, "2026-03-10T13:00:00Z", { price: 15000, paid: true, paidAt: "2026-03-10T15:00:00Z" });
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("traz só as pagas, com valor, do ano, e com o CPF do paciente", async () => {
    const linhas = await appRouter.createCaller(ctx(ID.A)).appointments.recibosParaReceitaSaude({ ano: 2026 });
    expect(linhas.map((l) => l.id).sort()).toEqual([consulta.marco, consulta.virada].sort());
    const marco = linhas.find((l) => l.id === consulta.marco)!;
    expect(marco).toMatchObject({ firstName: "Ana", cpf: "11144477735", price: 15000 });
    expect(new Date(marco.pagamentoInformadoEm!).toISOString()).toBe("2026-03-11T12:00:00.000Z");
  });

  it("a sessão de dezembro paga em janeiro aparece também no ano da sessão", async () => {
    const linhas = await appRouter.createCaller(ctx(ID.A)).appointments.recibosParaReceitaSaude({ ano: 2025 });
    expect(linhas.map((l) => l.id)).toEqual([consulta.virada]);
  });

  it("uma psicóloga não vê as consultas da outra", async () => {
    const daB = await appRouter.createCaller(ctx(ID.B)).appointments.recibosParaReceitaSaude({ ano: 2026 });
    expect(daB.map((l) => l.id)).toEqual([consulta.daOutra]);
  });
});
