/**
 * Rede, contra o Postgres real: o mural de pacientes (só quem liga aparece) e o convite
 * da psicóloga para a primeira conversa, que o paciente aceita ou recusa.
 *
 * - A e B: psicólogas na busca, com horários.  P e Q: pacientes no mural.
 * - M: menor no mural.  N: paciente que NÃO ligou o mural.  V: já é paciente de B.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { criarAssinaturaNaAprovacao } from "./assinaturas";
import { MAX_CONVITES_POR_DIA } from "../shared/conhecer";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990311, B: 990312, P: 990313, Q: 990314, M: 990315, N: 990316, V: 990317 } as const;
const DIA = 24 * 60 * 60 * 1000;

function ctx(userId: number, role: "therapist" | "user" = "user"): TrpcContext {
  return {
    user: {
      id: userId, openId: `sb:rede-${userId}`, email: `rede-${userId}@teste.local`, name: `Pessoa${userId} Sobrenome`,
      loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

function emDias(dias: number, hora: number): string {
  const d = new Date(Date.now() + dias * DIA);
  d.setUTCHours(hora, 0, 0, 0);
  return d.toISOString();
}

describe.runIf(RUN)("rede: mural de pacientes e convites (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const a = appRouter.createCaller(ctx(ID.A, "therapist"));
  const b = appRouter.createCaller(ctx(ID.B, "therapist"));
  const p = appRouter.createCaller(ctx(ID.P));
  const q = appRouter.createCaller(ctx(ID.Q));
  const m = appRouter.createCaller(ctx(ID.M));
  const n = appRouter.createCaller(ctx(ID.N));
  const v = appRouter.createCaller(ctx(ID.V));
  const visitante = appRouter.createCaller({ ...ctx(ID.N), user: null } as TrpcContext);
  const id = { A: 0, B: 0 };
  const horarioDaA: number[] = [];
  const horarioDaB: number[] = [];

  async function limpar() {
    for (const userId of [ID.A, ID.B]) {
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      if (!t) continue;
      await sql`delete from "pedidosParaConhecer" where "therapistId" = ${t.id}`;
      await sql`delete from "horariosParaConhecer" where "therapistId" = ${t.id}`;
      await sql`delete from notifications where "appointmentId" in (select id from appointments where "therapistId" = ${t.id})`;
      await sql`delete from appointments where "therapistId" = ${t.id}`;
      await sql`delete from patients where "therapistId" = ${t.id}`;
      await sql`delete from assinaturas where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from assinaturas where crp in ('REDE-01', 'REDE-02')`;
    await sql`delete from "perfisDePaciente" where "userId" in ${sql(Object.values(ID))}`;
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const [nome, userId] of Object.entries(ID)) {
      await sql`insert into users (id, "openId", name, email, role)
                values (${userId}, ${`sb:rede-${userId}`}, ${`Pessoa${userId} Sobrenome`}, ${`rede-${userId}@teste.local`}, ${nome === "A" || nome === "B" ? "therapist" : "user"})`;
    }
    const db = (await getDb())!;
    for (const [caller, userId, crp, chave] of [[a, ID.A, "REDE-01", "A"], [b, ID.B, "REDE-02", "B"]] as const) {
      await caller.therapists.upsert({
        crp,
        specialties: "Ansiedade",
        bio: "Atendo adultos com ansiedade há oito anos, com escuta acolhedora e sem julgamento.",
        publicoAtendido: "Adultos",
        sessionPrice: 15000,
      });
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      id[chave] = t.id;
      await criarAssinaturaNaAprovacao(db, { therapistId: t.id, crp, celular: null });
      await caller.conhecer.salvarVitrine({ naBusca: true, abordagem: "TCC", modalidade: "online", cidade: null, uf: null });
    }
    for (let i = 1; i <= 3; i++) {
      await a.conhecer.abrirHorario({ inicio: emDias(i, 13), duracao: 20 });
      await b.conhecer.abrirHorario({ inicio: emDias(i, 15), duracao: 20 });
    }
    horarioDaA.push(...(await a.conhecer.minhaVitrine())!.horarios.map((h) => h.id));
    horarioDaB.push(...(await b.conhecer.minhaVitrine())!.horarios.map((h) => h.id));

    const adulto = { cidade: "Recife", uf: "PE" as const, nascimento: "1990-01-01", modalidade: "online" as const, oQueProcura: "Ansiedade no trabalho" };
    await p.conhecer.salvarMeuPerfil({ ...adulto, noMural: true });
    await q.conhecer.salvarMeuPerfil({ ...adulto, uf: "SP", noMural: true });
    await m.conhecer.salvarMeuPerfil({ ...adulto, nascimento: "2013-01-01", noMural: true });
    await n.conhecer.salvarMeuPerfil({ ...adulto, noMural: false });
    await v.conhecer.salvarMeuPerfil({ ...adulto, noMural: true });
    await sql`insert into patients ("therapistId", "userId", "firstName", "lastName", email, status)
              values (${id.B}, ${ID.V}, 'Vinculado', 'Teste', ${`rede-${ID.V}@teste.local`}, 'active')`;
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("o mural mostra só quem ligou, maior de idade e sem psicóloga, com o primeiro nome", async () => {
    const r = await a.conhecer.mural({ pagina: 1 });
    const ids = r.itens.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([ID.P, ID.Q]));
    for (const fora of [ID.M, ID.N, ID.V]) expect(ids).not.toContain(fora);
    const item = r.itens.find((i) => i.id === ID.P)!;
    expect(item).toMatchObject({ primeiroNome: `Pessoa${ID.P}`, cidade: "Recife", uf: "PE", oQueProcura: "Ansiedade no trabalho", convidado: false });
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("Sobrenome");
    expect(texto).not.toContain("@teste.local");
    // Filtro por estado e por modalidade (os dois preferem online).
    expect((await a.conhecer.mural({ uf: "SP", pagina: 1 })).itens.map((i) => i.id)).toEqual([ID.Q]);
    const presencial = (await a.conhecer.mural({ modalidade: "presencial", pagina: 1 })).itens.map((i) => i.id);
    expect(presencial).not.toContain(ID.P);
    expect(presencial).not.toContain(ID.Q);
  });

  it("o mural é só para psicólogas", async () => {
    await expect(p.conhecer.mural({ pagina: 1 })).rejects.toThrow();
  });

  it("a psicóloga convida; o horário sai da busca e não pode ser fechado; não convida duas vezes", async () => {
    await a.conhecer.convidar({ pacienteId: ID.P, horarioId: horarioDaA[0], mensagem: "Tenho um horário para você." });
    expect((await a.conhecer.mural({ pagina: 1 })).itens.find((i) => i.id === ID.P)?.convidado).toBe(true);
    expect((await visitante.conhecer.perfil({ id: id.A }))?.horarios.map((h) => h.id)).not.toContain(horarioDaA[0]);
    expect((await a.conhecer.minhaVitrine())?.horarios.find((h) => h.id === horarioDaA[0])?.pedido).toBe("convite");
    await expect(a.conhecer.fecharHorario({ id: horarioDaA[0] })).rejects.toThrow(/convite/);
    await expect(a.conhecer.convidar({ pacienteId: ID.P, horarioId: horarioDaA[1] })).rejects.toThrow(/já convidou/);
    await expect(a.conhecer.convidar({ pacienteId: ID.N, horarioId: horarioDaA[1] })).rejects.toThrow(/não está mais no mural/);
    await expect(a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaB[0] })).rejects.toThrow(/2 horas/);
    // O convite não vira "pedido recebido", e ela não aceita o próprio convite.
    expect(await a.conhecer.pedidosRecebidos()).toEqual([]);
    const [convite] = await a.conhecer.convitesEnviados();
    expect(convite).toMatchObject({ primeiroNome: `Pessoa${ID.P}`, status: "pendente" });
    await expect(a.conhecer.aceitar({ id: convite.id })).rejects.toThrow(/não está mais esperando/);
  });

  it("o paciente vê o convite com o recado; convite não impede de pedir a outra", async () => {
    const situacao = await p.conhecer.minhaSituacao();
    expect(situacao.convites).toHaveLength(1);
    expect(situacao.convites[0]).toMatchObject({ therapistId: id.A, status: "pendente", mensagem: "Tenho um horário para você." });
    expect(situacao.motivo).toBeNull();
    await b.conhecer.convidar({ pacienteId: ID.P, horarioId: horarioDaB[1] });
    expect((await p.conhecer.minhaSituacao()).convites).toHaveLength(2);
  });

  it("IDOR: outro paciente não responde, outra psicóloga não cancela", async () => {
    const [convite] = await a.conhecer.convitesEnviados();
    await expect(q.conhecer.responderConvite({ id: convite.id, aceitar: true })).rejects.toThrow();
    await expect(b.conhecer.cancelarConvite({ id: convite.id })).rejects.toThrow();
    const [linha] = await sql`select status from "pedidosParaConhecer" where id = ${convite.id}`;
    expect(linha.status).toBe("pendente");
  });

  it("aceitar o convite cria a ficha e a consulta, encerra o convite da outra e tira do mural", async () => {
    const [convite] = await a.conhecer.convitesEnviados();
    await p.conhecer.responderConvite({ id: convite.id, aceitar: true });
    const [ficha] = await sql`select * from patients where "userId" = ${ID.P}`;
    expect(ficha).toMatchObject({ therapistId: id.A, status: "active" });
    const [pedido] = await sql`select status, "appointmentId" from "pedidosParaConhecer" where id = ${convite.id}`;
    expect(pedido.status).toBe("aceito");
    const [consulta] = await sql`select duration, price from appointments where id = ${pedido.appointmentId}`;
    expect(consulta).toMatchObject({ duration: 20, price: null });
    // O convite da B se encerra e o horário dela volta para a busca.
    const [daB] = await b.conhecer.convitesEnviados();
    expect(daB.status).toBe("cancelado");
    expect((await visitante.conhecer.perfil({ id: id.B }))?.horarios.map((h) => h.id)).toContain(horarioDaB[1]);
    expect((await a.conhecer.mural({ pagina: 1 })).itens.map((i) => i.id)).not.toContain(ID.P);
    expect((await p.conhecer.minhaSituacao()).motivo).toBe("vinculado");
  });

  it("recusar devolve o horário; cancelar o convite também", async () => {
    await a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaA[1] });
    const [convite] = (await q.conhecer.minhaSituacao()).convites;
    await q.conhecer.responderConvite({ id: convite.id, aceitar: false });
    expect((await q.conhecer.minhaSituacao()).convites[0].status).toBe("recusado");
    expect((await visitante.conhecer.perfil({ id: id.A }))?.horarios.map((h) => h.id)).toContain(horarioDaA[1]);
    await expect(q.conhecer.responderConvite({ id: convite.id, aceitar: true })).rejects.toThrow(/não está mais esperando/);

    await a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaA[2] });
    const novo = (await a.conhecer.convitesEnviados()).find((c) => c.status === "pendente")!;
    await a.conhecer.cancelarConvite({ id: novo.id });
    expect((await q.conhecer.minhaSituacao()).convites.find((c) => c.id === novo.id)?.status).toBe("cancelado");
  });

  it("desligar o mural tira a pessoa do mural", async () => {
    await q.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "SP", nascimento: "1990-01-01", modalidade: "online", oQueProcura: null, noMural: false });
    expect((await a.conhecer.mural({ pagina: 1 })).itens.map((i) => i.id)).not.toContain(ID.Q);
  });

  it("convite de quem ganhou psicóloga por outro caminho se encerra e devolve o horário", async () => {
    await q.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "SP", nascimento: "1990-01-01", modalidade: "online", oQueProcura: null, noMural: true });
    await a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaA[2] });
    // Q vira paciente de B pelo cadastro normal (fora da Rede).
    await sql`insert into patients ("therapistId", "userId", "firstName", "lastName", email, status)
              values (${id.B}, ${ID.Q}, 'Outro', 'Caminho', ${`rede-${ID.Q}@teste.local`}, 'active')`;
    const enviados = await a.conhecer.convitesEnviados();
    expect(enviados.find((c) => c.status === "pendente")).toBeUndefined();
    expect((await a.conhecer.minhaVitrine())?.horarios.find((h) => h.id === horarioDaA[2])?.pedido).toBeNull();
    await sql`delete from patients where "userId" = ${ID.Q}`;
  });

  it("teto de convites em 24 h: convidar e cancelar em laço não vira enxurrada de e-mails", async () => {
    const [{ n }] = await sql`select count(*)::int as n from "pedidosParaConhecer"
                              where "therapistId" = ${id.A} and origem = 'psicologa' and "createdAt" > now() - interval '1 day'`;
    for (let i = n; i < MAX_CONVITES_POR_DIA; i++) {
      await a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaA[2] });
      const pendente = (await a.conhecer.convitesEnviados()).find((c) => c.status === "pendente")!;
      await a.conhecer.cancelarConvite({ id: pendente.id });
    }
    await expect(a.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaA[2] })).rejects.toThrow(/últimas 24 horas/);
    // Convites de outros dias não contam (e não atrapalham os testes seguintes).
    await sql`update "pedidosParaConhecer" set "createdAt" = now() - interval '2 days' where "therapistId" = ${id.A} and origem = 'psicologa'`;
  });

  it("psicóloga com o plano vencido não lê o mural", async () => {
    const [antes] = await sql`select "testeAte", "pagoAte", "testeAguardando" from assinaturas where "therapistId" = ${id.A}`;
    await sql`update assinaturas set "testeAte" = now() - interval '1 day', "pagoAte" = null, "testeAguardando" = false where "therapistId" = ${id.A}`;
    await expect(a.conhecer.mural({ pagina: 1 })).rejects.toThrow();
    await sql`update assinaturas set "testeAte" = ${antes.testeAte}, "pagoAte" = ${antes.pagoAte}, "testeAguardando" = ${antes.testeAguardando} where "therapistId" = ${id.A}`;
  });

  it("sem 'aparecer na busca' a psicóloga não convida", async () => {
    await q.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "SP", nascimento: "1990-01-01", modalidade: "online", oQueProcura: null, noMural: true });
    await b.conhecer.salvarVitrine({ naBusca: false, abordagem: "TCC", modalidade: "online", cidade: null, uf: null });
    await expect(b.conhecer.convidar({ pacienteId: ID.Q, horarioId: horarioDaB[2] })).rejects.toThrow(/Aparecer na busca/);
  });
});
