/**
 * A Luma escrevendo na agenda, contra o Postgres real. As ações chegam aqui já
 * confirmadas pela psicóloga (o código de confirmação tem teste próprio); o que
 * se testa é o ESCOPO e as regras de horário:
 * - a Luma de uma psicóloga não agenda para o paciente de outra, nem remarca,
 *   cancela ou marca pagamento em consulta alheia;
 * - paciente e admin sem perfil de psicóloga não escrevem na agenda;
 * - a consulta semanal pula semana ocupada e semana que já passou;
 * - remarcar não cai em cima de outra consulta;
 * - as leituras (agenda, pendências) não misturam psicólogas.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getDb } from "./db";
import { executarAcaoAgenda, readPendenciasFinanceiras, readTherapistAgenda, resolveAiAccessContext } from "./ai/clinical-tools";
import type { AiAccessContext } from "./ai/access";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { A: 990401, B: 990402, P: 990403, ADMIN: 990404 } as const;
const HORA = 60 * 60 * 1000;
const SEMANA = 7 * 24 * HORA;

describe.runIf(RUN)("Luma na agenda: escopo e regras de horário (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  const t = { A: 0, B: 0 };
  const pac = { A: 0, B: 0 };
  let ctxA: AiAccessContext;
  let ctxB: AiAccessContext;
  let consultaDoA = 0;
  /** Segunda que vem, 10h de Brasília: horário redondo e no futuro. */
  const base = (() => {
    const d = new Date(Date.now() + 8 * 24 * HORA);
    d.setUTCHours(13, 0, 0, 0);
    return d;
  })();

  async function limpar() {
    const ts = await sql`select id from therapists where "userId" in ${sql([ID.A, ID.B, ID.ADMIN])}`;
    const ids = ts.map((x) => x.id as number);
    if (ids.length) {
      await sql`delete from appointments where "therapistId" in ${sql(ids)}`;
      await sql`delete from patients where "therapistId" in ${sql(ids)}`;
      await sql`delete from therapists where id in ${sql(ids)}`;
    }
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  const linhaDaConsulta = async (id: number) =>
    JSON.stringify((await sql`select "scheduledAt", duration, status, paid, "paidAt" from appointments where id = ${id}`)[0]);

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    db = (await getDb())!;
    await limpar();
    for (const [nome, id] of Object.entries(ID)) {
      const role = nome === "P" ? "user" : nome === "ADMIN" ? "admin" : "therapist";
      await sql`insert into users (id, "openId", name, email, role) values (${id}, ${`sb:luma-${id}`}, ${`Luma ${nome}`}, ${`luma-${id}@teste.local`}, ${role})`;
    }
    for (const nome of ["A", "B"] as const) {
      [{ id: t[nome] }] = await sql`insert into therapists ("userId", crp) values (${ID[nome]}, ${`99/40000${nome === "A" ? 1 : 2}`}) returning id`;
      [{ id: pac[nome] }] = await sql`insert into patients ("therapistId", "firstName", "lastName", email)
                                      values (${t[nome]}, ${`Paciente${nome}`}, 'Teste', ${`pac-luma-${nome}@teste.local`}) returning id`;
    }
    await sql`update patients set "userId" = ${ID.P} where id = ${pac.A}`;
    [{ id: consultaDoA }] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, status, paid)
                                      values (${t.A}, ${pac.A}, ${new Date(base.getTime() - 2 * 24 * HORA)}, 50, 'completed', false) returning id`;
    ctxA = await resolveAiAccessContext(db, { id: ID.A, role: "therapist" });
    ctxB = await resolveAiAccessContext(db, { id: ID.B, role: "therapist" });
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("a Luma de outra psicóloga não mexe em consulta nem em paciente alheio", async () => {
    const antes = await linhaDaConsulta(consultaDoA);
    for (const [acao, params] of [
      ["cancelar_consulta", { appointmentId: consultaDoA }],
      ["remarcar_consulta", { appointmentId: consultaDoA, novoHorario: base.toISOString(), duration: 50 }],
      ["registrar_pagamento", { appointmentId: consultaDoA, pago: true }],
    ] as const) {
      expect(await executarAcaoAgenda(db, ctxB, acao, params)).toMatch(/Não encontrei a consulta/);
    }
    await expect(
      executarAcaoAgenda(db, ctxB, "agendar_consulta", { patientId: pac.A, scheduledAt: base.toISOString(), duration: 50, semanas: 1, notes: "" }),
    ).rejects.toThrow(/não pertence/);
    expect(await linhaDaConsulta(consultaDoA)).toBe(antes);
    expect(await sql`select id from appointments where "therapistId" = ${t.B}`).toHaveLength(0);
  });

  it("paciente e admin sem perfil de psicóloga não escrevem na agenda", async () => {
    const ctxPaciente = await resolveAiAccessContext(db, { id: ID.P, role: "user" });
    const ctxAdmin = await resolveAiAccessContext(db, { id: ID.ADMIN, role: "admin" });
    for (const ctx of [ctxPaciente, ctxAdmin]) {
      await expect(executarAcaoAgenda(db, ctx, "cancelar_consulta", { appointmentId: consultaDoA })).rejects.toThrow(/Apenas a terapeuta/);
    }
  });

  it("semanal: pula a semana ocupada e a que já passou; agenda o resto", async () => {
    // Semana 2 já ocupada às 10h30 (cruza a sessão das 10h).
    const [ocupada] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration)
              values (${t.A}, ${pac.A}, ${new Date(base.getTime() + SEMANA + 30 * 60_000)}, 50) returning id`;
    // 5 semanas a partir de base − 2 semanas: a 1ª já passou (há 6 dias), a 2ª é
    // amanhã, a 3ª é base, a 4ª está ocupada e a 5ª é base + 2 semanas.
    const inicio = new Date(base.getTime() - 2 * SEMANA);
    const resposta = await executarAcaoAgenda(db, ctxA, "agendar_consulta", {
      patientId: pac.A, scheduledAt: inicio.toISOString(), duration: 50, semanas: 5, notes: "",
    });
    expect(resposta).toMatch(/AGENDADO: 3 consulta\(s\)/);
    expect(resposta).toMatch(/1 por conflito e 1 no passado/);
    const criadas = await sql`select "scheduledAt" from appointments where "therapistId" = ${t.A} and status = 'scheduled'
                              and "scheduledAt" > now() and id <> ${ocupada.id} order by "scheduledAt"`;
    expect(criadas.map((c) => new Date(c.scheduledAt).getTime())).toEqual([
      base.getTime() - SEMANA, base.getTime(), base.getTime() + 2 * SEMANA,
    ]);
  });

  it("remarcar em cima de outra consulta é recusado; num horário livre, remarca", async () => {
    const [consulta] = await sql`select id from appointments where "therapistId" = ${t.A} and "scheduledAt" = ${base}`;
    const antes = await linhaDaConsulta(consulta.id);
    const ocupado = new Date(base.getTime() + SEMANA + 30 * 60_000);
    expect(
      await executarAcaoAgenda(db, ctxA, "remarcar_consulta", { appointmentId: consulta.id, novoHorario: ocupado.toISOString(), duration: 50 }),
    ).toMatch(/CONFLITO DE HORÁRIO/);
    expect(await linhaDaConsulta(consulta.id)).toBe(antes);

    const livre = new Date(base.getTime() + 3 * HORA);
    expect(
      await executarAcaoAgenda(db, ctxA, "remarcar_consulta", { appointmentId: consulta.id, novoHorario: livre.toISOString(), duration: 50 }),
    ).toMatch(/REMARCADA/);
    const [depois] = await sql`select "scheduledAt" from appointments where id = ${consulta.id}`;
    expect(new Date(depois.scheduledAt).getTime()).toBe(livre.getTime());
  });

  it("cancelar duas vezes não quebra: a segunda avisa que já está cancelada", async () => {
    const [consulta] = await sql`select id from appointments where "therapistId" = ${t.A} and status = 'scheduled' order by id limit 1`;
    expect(await executarAcaoAgenda(db, ctxA, "cancelar_consulta", { appointmentId: consulta.id })).toMatch(/CANCELADA/);
    expect(await executarAcaoAgenda(db, ctxA, "cancelar_consulta", { appointmentId: consulta.id })).toMatch(/já está cancelada/);
  });

  it("as leituras da Luma não misturam psicólogas", async () => {
    expect(JSON.stringify(await readTherapistAgenda(ctxB, db))).not.toContain("PacienteA");
    expect(JSON.stringify(await readPendenciasFinanceiras(ctxB, db))).not.toContain("PacienteA");
    // Controle: para a própria psicóloga a pendência aparece.
    expect(JSON.stringify(await readPendenciasFinanceiras(ctxA, db))).toContain("PacienteA");
  });
});
