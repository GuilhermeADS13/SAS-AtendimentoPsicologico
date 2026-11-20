/**
 * Férias e folgas contra o Postgres real: marcar, listar e apagar só as próprias, e a
 * busca de pacientes escondendo (e recusando no pedido) o horário que cai nas férias.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { criarAssinaturaNaAprovacao } from "./assinaturas";
import { partesEmBrasilia } from "../shared/datas";
import { somarDias } from "../shared/lembretesDoDia";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990601, B: 990602, P: 990603 } as const;
const DIA = 24 * 60 * 60 * 1000;

function ctx(userId: number | null, role: "therapist" | "user" = "user"): TrpcContext {
  return {
    user: userId
      ? {
          id: userId, openId: `sb:ferias-${userId}`, email: `ferias-${userId}@teste.local`, name: `Pessoa ${userId} Teste`,
          loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

/** Daqui a N dias, às 13h UTC (10h em Brasília). */
function emDias(dias: number): Date {
  const d = new Date(Date.now() + dias * DIA);
  d.setUTCHours(13, 0, 0, 0);
  return d;
}

describe.runIf(RUN)("férias e folgas (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const visitante = appRouter.createCaller(ctx(null));
  const a = appRouter.createCaller(ctx(ID.A, "therapist"));
  const b = appRouter.createCaller(ctx(ID.B, "therapist"));
  const p = appRouter.createCaller(ctx(ID.P));
  let idDaA = 0;
  const horario = { nasFerias: 0, depois: 0 };
  let periodo = 0;

  async function limpar() {
    for (const userId of [ID.A, ID.B]) {
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      if (!t) continue;
      await sql`delete from ferias where "therapistId" = ${t.id}`;
      await sql`delete from "pedidosParaConhecer" where "therapistId" = ${t.id}`;
      await sql`delete from "horariosParaConhecer" where "therapistId" = ${t.id}`;
      await sql`delete from assinaturas where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from assinaturas where crp in ('FERIAS01', 'FERIAS02')`;
    await sql`delete from "perfisDePaciente" where "userId" in ${sql(Object.values(ID))}`;
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const [nome, id] of Object.entries(ID)) {
      await sql`insert into users (id, "openId", name, email, role)
                values (${id}, ${`sb:ferias-${id}`}, ${`Pessoa ${id} Teste`}, ${`ferias-${id}@teste.local`}, ${nome === "P" ? "user" : "therapist"})`;
    }
    const db = (await getDb())!;
    for (const [caller, userId, crp] of [[a, ID.A, "FERIAS-01"], [b, ID.B, "FERIAS-02"]] as const) {
      await caller.therapists.upsert({
        crp,
        specialties: "Ansiedade, Luto",
        bio: "Atendo adultos com ansiedade e luto há oito anos, com escuta acolhedora.",
        publicoAtendido: "Adultos",
        sessionPrice: 15000,
      });
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      await criarAssinaturaNaAprovacao(db, { therapistId: t.id, crp, celular: null });
    }
    idDaA = (await sql`select id from therapists where "userId" = ${ID.A}`)[0].id;
    await a.conhecer.salvarVitrine({ naBusca: true, abordagem: "TCC", modalidade: "online", cidade: null, uf: null });
    await a.conhecer.abrirHorario({ inicio: emDias(3).toISOString(), duracao: 20 });
    await a.conhecer.abrirHorario({ inicio: emDias(10).toISOString(), duracao: 20 });
    const vitrine = await a.conhecer.minhaVitrine();
    [horario.nasFerias, horario.depois] = vitrine!.horarios.map((h) => h.id);
    await p.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "PE", nascimento: "1990-01-01", modalidade: null, oQueProcura: null });
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("marca as férias e a busca esconde o horário que cai nelas", async () => {
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios).toHaveLength(2);
    const diaDoHorario = partesEmBrasilia(emDias(3)).data;
    const novo = await a.ferias.criar({ inicio: somarDias(diaDoHorario, -1), fim: somarDias(diaDoHorario, 1) });
    periodo = novo.id;
    expect((await a.ferias.listar()).map((f) => f.id)).toEqual([periodo]);
    const horarios = (await visitante.conhecer.perfil({ id: idDaA }))?.horarios ?? [];
    expect(horarios.map((h) => h.id)).toEqual([horario.depois]);
  });

  it("o pedido de um horário nas férias é recusado; o de depois passa", async () => {
    await expect(p.conhecer.pedir({ horarioId: horario.nasFerias })).rejects.toThrow(/não está mais livre/);
    await expect(p.conhecer.pedir({ horarioId: horario.depois })).resolves.toEqual({ ok: true });
  });

  it("outra psicóloga não vê nem apaga as férias da A", async () => {
    expect(await b.ferias.listar()).toEqual([]);
    await expect(b.ferias.remover({ id: periodo })).rejects.toThrow(/não existe/);
    expect((await a.ferias.listar()).map((f) => f.id)).toEqual([periodo]);
  });

  it("apagar as férias devolve o horário à busca", async () => {
    await sql`delete from "pedidosParaConhecer" where "therapistId" = ${idDaA}`;
    await a.ferias.remover({ id: periodo });
    expect(await a.ferias.listar()).toEqual([]);
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios).toHaveLength(2);
  });

  it("não convida para um horário das férias, e convite de antes não vira consulta nelas", async () => {
    await p.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "PE", nascimento: "1990-01-01", modalidade: null, oQueProcura: null, noMural: true });
    // Convite feito ANTES das férias.
    await a.conhecer.convidar({ pacienteId: ID.P, horarioId: horario.nasFerias });
    const diaDoHorario = partesEmBrasilia(emDias(3)).data;
    const novo = await a.ferias.criar({ inicio: diaDoHorario, fim: diaDoHorario });
    // Com as férias marcadas, convidar para outro horário nelas é recusado.
    await expect(a.conhecer.convidar({ pacienteId: ID.P, horarioId: horario.nasFerias })).rejects.toThrow();
    // O paciente aceita o convite antigo: não cria consulta nas férias.
    const [convite] = await sql`select id from "pedidosParaConhecer" where "therapistId" = ${idDaA} and origem = 'psicologa' and status = 'pendente'`;
    await expect(p.conhecer.responderConvite({ id: convite.id, aceitar: true })).rejects.toThrow(/não está mais livre/);
    const [{ total }] = await sql`select count(*)::int as total from appointments where "therapistId" = ${idDaA}`;
    expect(total).toBe(0);
    await a.ferias.remover({ id: novo.id });
    await sql`delete from "pedidosParaConhecer" where "therapistId" = ${idDaA}`;
  });

  it("convidar para um horário das férias explica o motivo", async () => {
    const diaDoHorario = partesEmBrasilia(emDias(10)).data;
    const novo = await a.ferias.criar({ inicio: diaDoHorario, fim: diaDoHorario });
    await expect(a.conhecer.convidar({ pacienteId: ID.P, horarioId: horario.depois })).rejects.toThrow(/cai nas suas férias/);
    await a.ferias.remover({ id: novo.id });
  });
});
