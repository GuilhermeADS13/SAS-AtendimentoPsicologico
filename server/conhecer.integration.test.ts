/**
 * Encontrar uma psicóloga, contra o Postgres real: busca pública, pedido de primeira
 * conversa, aceite que vira paciente + consulta, recusa, e ataques (IDOR).
 *
 * - A: psicóloga que aparece na busca e abre horários.
 * - B: outra psicóloga (não aparece), que tenta mexer nos pedidos e horários da A.
 * - P: paciente adulto que pede e é aceito.  Q: outro paciente.  M: menor de idade.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { criarAssinaturaNaAprovacao } from "./assinaturas";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990301, B: 990302, P: 990303, Q: 990304, M: 990305 } as const;
const DIA = 24 * 60 * 60 * 1000;

function ctx(userId: number | null, role: "therapist" | "user" = "user"): TrpcContext {
  return {
    user: userId
      ? {
          id: userId, openId: `sb:conhecer-${userId}`, email: `conhecer-${userId}@teste.local`, name: `Pessoa ${userId} Teste`,
          loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

/** Amanhã (ou daqui a N dias), numa hora cheia em UTC: longe das 2 h de antecedência. */
function emDias(dias: number, hora: number, minuto = 0): string {
  const d = new Date(Date.now() + dias * DIA);
  d.setUTCHours(hora, minuto, 0, 0);
  return d.toISOString();
}

describe.runIf(RUN)("encontrar uma psicóloga (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const visitante = appRouter.createCaller(ctx(null));
  const a = appRouter.createCaller(ctx(ID.A, "therapist"));
  const b = appRouter.createCaller(ctx(ID.B, "therapist"));
  const p = appRouter.createCaller(ctx(ID.P));
  const q = appRouter.createCaller(ctx(ID.Q));
  const m = appRouter.createCaller(ctx(ID.M));
  let idDaA = 0;
  const horario = { um: 0, dois: 0 };
  let pedidoDoP = 0;

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
    await sql`delete from assinaturas where crp in ('CONHECER01', 'CONHECER02')`;
    await sql`delete from "perfisDePaciente" where "userId" in ${sql(Object.values(ID))}`;
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const [nome, id] of Object.entries(ID)) {
      await sql`insert into users (id, "openId", name, email, role)
                values (${id}, ${`sb:conhecer-${id}`}, ${`Pessoa ${id} Teste`}, ${`conhecer-${id}@teste.local`}, ${nome === "A" || nome === "B" ? "therapist" : "user"})`;
    }
    const db = (await getDb())!;
    for (const [caller, userId, crp] of [[a, ID.A, "CONHECER-01"], [b, ID.B, "CONHECER-02"]] as const) {
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
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("a psicóloga abre horários; sobreposto e no passado são recusados", async () => {
    await a.conhecer.abrirHorario({ inicio: emDias(1, 13), duracao: 20 });
    await expect(a.conhecer.abrirHorario({ inicio: emDias(1, 13, 10), duracao: 20 })).rejects.toThrow(/encosta/);
    await a.conhecer.abrirHorario({ inicio: emDias(2, 13), duracao: 20 });
    await expect(a.conhecer.abrirHorario({ inicio: new Date(Date.now() - DIA).toISOString(), duracao: 20 })).rejects.toThrow(/30 minutos/);
    const vitrine = await a.conhecer.minhaVitrine();
    expect(vitrine?.horarios).toHaveLength(2);
    [horario.um, horario.dois] = vitrine!.horarios.map((h) => h.id);
  });

  it("a busca pública mostra só quem ligou 'aparecer', sem valor nem contato", async () => {
    const r = await visitante.conhecer.buscar({ texto: "ansiedade", pagina: 1 });
    const ids = r.itens.map((i) => i.id);
    expect(ids).toContain(idDaA);
    const idDaB = (await sql`select id from therapists where "userId" = ${ID.B}`)[0].id;
    expect(ids).not.toContain(idDaB);
    const item = r.itens.find((i) => i.id === idDaA)!;
    expect(item.horariosLivres).toBe(2);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("15000");
    expect(texto).not.toContain("@teste.local");
    expect(Object.keys(item)).not.toContain("sessionPrice");
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios).toHaveLength(2);
    expect(await visitante.conhecer.perfil({ id: idDaB })).toBeNull();
  });

  it("sem perfil completo, ou menor de idade, não pede", async () => {
    await expect(p.conhecer.pedir({ horarioId: horario.um })).rejects.toThrow(/Complete seu perfil/);
    await m.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "PE", nascimento: "2012-03-03", modalidade: null, oQueProcura: null });
    await expect(m.conhecer.pedir({ horarioId: horario.um })).rejects.toThrow(/maiores de 18/);
  });

  it("psicóloga não salva perfil de paciente nem pede horário", async () => {
    await expect(
      b.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "PE", nascimento: "1990-01-01", modalidade: null, oQueProcura: null }),
    ).rejects.toThrow();
    await expect(b.conhecer.pedir({ horarioId: horario.um })).rejects.toThrow(/Contas de psicóloga/);
  });

  it("o paciente pede; o mesmo horário não aceita outro pedido; um pendente por vez", async () => {
    await p.conhecer.salvarMeuPerfil({ cidade: "Recife", uf: "PE", nascimento: "1990-05-05", modalidade: "online", oQueProcura: "Ansiedade no trabalho" });
    await p.conhecer.pedir({ horarioId: horario.um, mensagem: "Prefiro conversar à tarde." });
    await q.conhecer.salvarMeuPerfil({ cidade: "Natal", uf: "RN", nascimento: "1985-01-01", modalidade: null, oQueProcura: null });
    await expect(q.conhecer.pedir({ horarioId: horario.um })).rejects.toThrow(/acabou de pedir|não está mais livre/);
    await expect(p.conhecer.pedir({ horarioId: horario.dois })).rejects.toThrow(/já tem um pedido/);
    const situacao = await p.conhecer.minhaSituacao();
    expect(situacao.motivo).toBe("pendente");
    pedidoDoP = situacao.pedidos[0].id;
    // O horário pedido some da busca.
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios.map((h) => h.id)).toEqual([horario.dois]);
  });

  it("IDOR: outra psicóloga e outro paciente não mexem no pedido nem no horário", async () => {
    await expect(b.conhecer.aceitar({ id: pedidoDoP })).rejects.toThrow();
    await expect(b.conhecer.recusar({ id: pedidoDoP })).rejects.toThrow();
    await expect(b.conhecer.fecharHorario({ id: horario.dois })).rejects.toThrow();
    expect(await b.conhecer.pedidosRecebidos()).toEqual([]);
    await expect(q.conhecer.cancelarMeuPedido({ id: pedidoDoP })).rejects.toThrow();
    const [pedido] = await sql`select status from "pedidosParaConhecer" where id = ${pedidoDoP}`;
    expect(pedido.status).toBe("pendente");
    const [h] = await sql`select id from "horariosParaConhecer" where id = ${horario.dois}`;
    expect(h).toBeTruthy();
  });

  it("a psicóloga vê o que o paciente procura, e não fecha horário com pedido", async () => {
    const recebidos = await a.conhecer.pedidosRecebidos();
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toMatchObject({ status: "pendente", oQueProcura: "Ansiedade no trabalho", idade: expect.any(Number), cidade: "Recife" });
    await expect(a.conhecer.fecharHorario({ id: horario.um })).rejects.toThrow(/tem um pedido/);
  });

  it("aceitar cria a ficha do paciente e a consulta; ele passa a ver a consulta", async () => {
    const r = await a.conhecer.aceitar({ id: pedidoDoP });
    const [ficha] = await sql`select * from patients where id = ${r.patientId}`;
    expect(ficha).toMatchObject({ "userId": ID.P, status: "active", "therapistId": idDaA, "firstName": "Pessoa" });
    const [consulta] = await sql`select * from appointments where id = ${r.appointmentId}`;
    expect(consulta.duration).toBe(20);
    expect(consulta.price).toBeNull();
    expect(consulta.roomToken).toBeTruthy();
    expect((await p.me.appointments()).map((c: { id: number }) => c.id)).toContain(r.appointmentId);
    const situacao = await p.conhecer.minhaSituacao();
    expect(situacao.motivo).toBe("vinculado");
    expect(situacao.pedidos[0].status).toBe("aceito");
    // Aceitar de novo não duplica nada.
    await expect(a.conhecer.aceitar({ id: pedidoDoP })).rejects.toThrow(/não está mais esperando/);
  });

  it("conversa aceita e depois desmarcada: o horário pode ser fechado", async () => {
    await expect(a.conhecer.fecharHorario({ id: horario.um })).rejects.toThrow(/conversa marcada/);
    await sql`update appointments set status = 'cancelled' where id = (select "appointmentId" from "pedidosParaConhecer" where id = ${pedidoDoP})`;
    const vitrine = await a.conhecer.minhaVitrine();
    expect(vitrine?.horarios.find((h) => h.id === horario.um)?.pedido).toBe("desmarcado");
    // Não volta para a busca: o pedido aceito continua preso a ele.
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios.map((h) => h.id)).toEqual([horario.dois]);
    await a.conhecer.fecharHorario({ id: horario.um });
    expect((await a.conhecer.minhaVitrine())?.horarios.map((h) => h.id)).toEqual([horario.dois]);
  });

  it("recusar devolve o horário e libera o paciente para pedir de novo", async () => {
    await q.conhecer.pedir({ horarioId: horario.dois });
    const [pedido] = await sql`select id from "pedidosParaConhecer" where "pacienteUserId" = ${ID.Q} and status = 'pendente'`;
    await a.conhecer.recusar({ id: pedido.id });
    const situacao = await q.conhecer.minhaSituacao();
    expect(situacao.motivo).toBeNull();
    expect(situacao.pedidos[0].status).toBe("recusado");
    expect((await visitante.conhecer.perfil({ id: idDaA }))?.horarios.map((h) => h.id)).toEqual([horario.dois]);
    // O paciente cancela um pedido novo; cancelar duas vezes não passa.
    await q.conhecer.pedir({ horarioId: horario.dois });
    const novo = (await q.conhecer.minhaSituacao()).pedidos[0].id;
    await q.conhecer.cancelarMeuPedido({ id: novo });
    await expect(q.conhecer.cancelarMeuPedido({ id: novo })).rejects.toThrow();
  });

  it("convite pelo e-mail de outra psicóloga conta como vínculo", async () => {
    const idDaB = (await sql`select id from therapists where "userId" = ${ID.B}`)[0].id;
    await sql`insert into patients ("therapistId", "firstName", "lastName", email, status)
              values (${idDaB}, 'Convite', 'Teste', ${`conhecer-${ID.Q}@teste.local`}, 'active')`;
    expect((await q.conhecer.minhaSituacao()).motivo).toBe("vinculado");
    await expect(q.conhecer.pedir({ horarioId: horario.dois })).rejects.toThrow(/já é paciente/);
    await sql`delete from patients where "therapistId" = ${idDaB}`;
  });

  it("ficha inativa que volta a ativa pelo aceite respeita o limite do plano", async () => {
    await sql`update assinaturas set plano = 'pro' where "therapistId" = ${idDaA}`;
    // P (ativo) + 10 = 11, o teto do Sussurro.
    for (let i = 0; i < 10; i++) {
      await sql`insert into patients ("therapistId", "firstName", "lastName", email, status)
                values (${idDaA}, 'Lotado', ${String(i)}, ${`lotado-${i}@teste.local`}, 'active')`;
    }
    await sql`insert into patients ("therapistId", "userId", "firstName", "lastName", email, status)
              values (${idDaA}, ${ID.Q}, 'Antigo', 'Teste', ${`conhecer-${ID.Q}@teste.local`}, 'inactive')`;
    await q.conhecer.pedir({ horarioId: horario.dois });
    const [pedido] = await sql`select id from "pedidosParaConhecer" where "pacienteUserId" = ${ID.Q} and status = 'pendente'`;
    await expect(a.conhecer.aceitar({ id: pedido.id })).rejects.toThrow(/mude de plano/);
    const [ficha] = await sql`select status from patients where "userId" = ${ID.Q}`;
    expect(ficha.status).toBe("inactive");
    await a.conhecer.recusar({ id: pedido.id });
    await sql`delete from patients where "therapistId" = ${idDaA} and ("firstName" = 'Lotado' or "userId" = ${ID.Q})`;
  });

  it("quem esvazia a apresentação depois de ligar sai da busca", async () => {
    await sql`update therapists set bio = 'Curta.' where id = ${idDaA}`;
    expect((await visitante.conhecer.buscar({ pagina: 1 })).itens.map((i) => i.id)).not.toContain(idDaA);
    expect(await visitante.conhecer.perfil({ id: idDaA })).toBeNull();
    await sql`update therapists set bio = 'Atendo adultos com ansiedade e luto há oito anos, com escuta acolhedora.' where id = ${idDaA}`;
    expect(await visitante.conhecer.perfil({ id: idDaA })).not.toBeNull();
  });

  it("'Baixar meus dados' leva o perfil e os pedidos da busca", async () => {
    const dados = (await p.me.exportarMeusDados()) as Record<string, unknown>;
    expect(dados.perfilNaBuscaDePsicologas).toMatchObject({ cidade: "Recife", oQueProcura: "Ansiedade no trabalho" });
    expect(dados.pedidosDePrimeiraConversa).toEqual([expect.objectContaining({ situacao: "aceito" })]);
  });

  it("desligar 'aparecer na busca' tira a psicóloga da busca e do perfil público", async () => {
    await a.conhecer.salvarVitrine({ naBusca: false, abordagem: "TCC", modalidade: "online", cidade: null, uf: null });
    expect((await visitante.conhecer.buscar({ pagina: 1 })).itens.map((i) => i.id)).not.toContain(idDaA);
    expect(await visitante.conhecer.perfil({ id: idDaA })).toBeNull();
  });
});
