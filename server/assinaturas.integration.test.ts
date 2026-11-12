/**
 * Assinatura contra o Postgres real: quem ganha o teste grátis, quando ele começa,
 * quando o acesso pausa, o limite de pacientes do plano e quem nunca é bloqueado.
 * As regras puras já têm teste em assinatura.test.ts; aqui é o caminho com o banco
 * (os WHERE e os JOIN que decidem de verdade).
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { getDb } from "./db";
import {
  contarPacientesCobrados,
  criarAssinaturaNaAprovacao,
  exigirAssinaturaAtiva,
  exigirVagaNoPlano,
  iniciarTesteNoPrimeiroPaciente,
  psicologaLiberada,
  vagasNoPlano,
} from "./assinaturas";
import { DIAS_DE_TESTE_GRATIS, DIAS_PARA_O_PRIMEIRO_PACIENTE } from "../shared/precos";
import { MENSAGEM_ASSINATURA_VENCIDA } from "../shared/assinatura";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const PRIMEIRO_ID = 990201;
const DIA = 24 * 60 * 60 * 1000;

describe.runIf(RUN)("assinatura com o banco (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let proximo = PRIMEIRO_ID;

  /** Cria conta + perfil de psicóloga; devolve userId e therapistId. */
  async function novaPsicologa(crp: string, role: "therapist" | "admin" = "therapist") {
    const userId = proximo++;
    await sql`insert into users (id, "openId", name, email, role)
              values (${userId}, ${`sb:assin-${userId}`}, ${`Assin ${userId}`}, ${`assin-${userId}@teste.local`}, ${role})`;
    const [t] = await sql`insert into therapists ("userId", crp) values (${userId}, ${crp}) returning id`;
    return { userId, therapistId: t.id as number, user: { id: userId, role } };
  }

  async function pacientes(therapistId: number, n: number, status = "active") {
    for (let i = 0; i < n; i++) {
      await sql`insert into patients ("therapistId", "firstName", "lastName", email, status)
                values (${therapistId}, 'Pac', ${`${i}`}, ${`p${therapistId}-${i}-${status}@teste.local`}, ${status})`;
    }
  }

  async function limpar() {
    const ts = await sql`select id from therapists where "userId" >= ${PRIMEIRO_ID} and "userId" < ${PRIMEIRO_ID + 100}`;
    const ids = ts.map((t) => t.id as number);
    if (ids.length) {
      await sql`delete from "appointmentParticipants" where "patientId" in (select id from patients where "therapistId" in ${sql(ids)})`;
      await sql`delete from appointments where "therapistId" in ${sql(ids)}`;
      await sql`delete from patients where "therapistId" in ${sql(ids)}`;
      await sql`delete from assinaturas where "therapistId" in ${sql(ids)}`;
      await sql`delete from therapists where id in ${sql(ids)}`;
    }
    await sql`delete from assinaturas where crp like '99%'`;
    await sql`delete from users where id >= ${PRIMEIRO_ID} and id < ${PRIMEIRO_ID + 100}`;
  }

  const assinaturaDe = async (therapistId: number) =>
    (await sql`select * from assinaturas where "therapistId" = ${therapistId}`)[0];

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    db = (await getDb())!;
    await limpar();
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("aprovação dá o teste, que espera o primeiro paciente; repetir não cria outra assinatura", async () => {
    const { therapistId } = await novaPsicologa("99/100001");
    expect(await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100001", celular: "81999990001" })).toMatchObject({ ganhouTeste: true });
    const a = await assinaturaDe(therapistId);
    expect(a.testeAguardando).toBe(true);
    expect(a.testeAte).toBeNull();
    expect(await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100001", celular: null })).toMatchObject({ ganhouTeste: true });
    expect(await sql`select id from assinaturas where "therapistId" = ${therapistId}`).toHaveLength(1);
    // Aguardando o primeiro paciente: liberada.
    expect(await psicologaLiberada(db, therapistId)).toBe(true);
  });

  it("conta nova com o mesmo CRP (escrito diferente) ou o mesmo celular não ganha outro teste", async () => {
    const mesmoCrp = await novaPsicologa("99100001");
    expect(await criarAssinaturaNaAprovacao(db, { therapistId: mesmoCrp.therapistId, crp: "99100001", celular: null })).toMatchObject({ ganhouTeste: false });
    const mesmoCelular = await novaPsicologa("99/100002");
    expect(
      await criarAssinaturaNaAprovacao(db, { therapistId: mesmoCelular.therapistId, crp: "99/100002", celular: "(81) 99999-0001" }),
    ).toMatchObject({ ganhouTeste: false });
    // Sem teste e sem Pix: o uso novo é barrado, com a mensagem de sempre.
    await expect(exigirAssinaturaAtiva(db, mesmoCrp.user)).rejects.toThrow(MENSAGEM_ASSINATURA_VENCIDA);
    expect(await psicologaLiberada(db, mesmoCrp.therapistId)).toBe(false);
  });

  it("o teste começa no primeiro paciente, uma vez só", async () => {
    const { therapistId, user } = await novaPsicologa("99/100003");
    await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100003", celular: null });
    const agora = new Date();
    await iniciarTesteNoPrimeiroPaciente(db, therapistId, agora);
    const a = await assinaturaDe(therapistId);
    expect(a.testeAguardando).toBe(false);
    expect(new Date(a.testeAte).getTime()).toBe(agora.getTime() + DIAS_DE_TESTE_GRATIS * DIA);
    // Cadastrar o segundo paciente dias depois não empurra o fim do teste.
    await iniciarTesteNoPrimeiroPaciente(db, therapistId, new Date(agora.getTime() + 5 * DIA));
    expect(new Date((await assinaturaDe(therapistId)).testeAte).getTime()).toBe(agora.getTime() + DIAS_DE_TESTE_GRATIS * DIA);
    await expect(exigirAssinaturaAtiva(db, user)).resolves.toBeUndefined();
  });

  it("sem paciente no prazo o acesso pausa, e um cadastro tardio não reabre o teste", async () => {
    const { therapistId, user } = await novaPsicologa("99/100004");
    await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100004", celular: null });
    await sql`update assinaturas set "createdAt" = ${new Date(Date.now() - (DIAS_PARA_O_PRIMEIRO_PACIENTE + 1) * DIA)}
              where "therapistId" = ${therapistId}`;
    expect(await psicologaLiberada(db, therapistId)).toBe(false);
    await iniciarTesteNoPrimeiroPaciente(db, therapistId);
    expect((await assinaturaDe(therapistId)).testeAte).toBeNull();
    await expect(exigirAssinaturaAtiva(db, user)).rejects.toThrow(MENSAGEM_ASSINATURA_VENCIDA);
  });

  it("teste vencido bloqueia; o Pix em dia libera de novo", async () => {
    const { therapistId, user } = await novaPsicologa("99/100005");
    await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100005", celular: null });
    await sql`update assinaturas set "testeAguardando" = false, "testeAte" = ${new Date(Date.now() - DIA)}
              where "therapistId" = ${therapistId}`;
    await expect(exigirAssinaturaAtiva(db, user)).rejects.toThrow(MENSAGEM_ASSINATURA_VENCIDA);
    expect(await psicologaLiberada(db, therapistId)).toBe(false);
    await sql`update assinaturas set "pagoAte" = ${new Date(Date.now() + 10 * DIA)} where "therapistId" = ${therapistId}`;
    await expect(exigirAssinaturaAtiva(db, user)).resolves.toBeUndefined();
    expect(await psicologaLiberada(db, therapistId)).toBe(true);
  });

  it("a admin nunca é bloqueada, nem sem assinatura", async () => {
    const { therapistId, user } = await novaPsicologa("99/100006", "admin");
    await expect(exigirAssinaturaAtiva(db, user)).resolves.toBeUndefined();
    expect(await psicologaLiberada(db, therapistId)).toBe(true);
    await pacientes(therapistId, 40);
    await expect(exigirVagaNoPlano(db, therapistId)).resolves.toBeUndefined();
  });

  it("limite de pacientes do Sussurro: o 12º é barrado; inativo e arquivado não contam", async () => {
    const { therapistId } = await novaPsicologa("99/100007");
    await criarAssinaturaNaAprovacao(db, { therapistId, crp: "99/100007", celular: null });
    await pacientes(therapistId, 10);
    await pacientes(therapistId, 1, "pending");
    await pacientes(therapistId, 3, "inactive");
    await pacientes(therapistId, 3, "archived");
    expect(await contarPacientesCobrados(db, therapistId)).toBe(11);
    await expect(exigirVagaNoPlano(db, therapistId)).rejects.toThrow(/vai até 11 pacientes/);
    // A importação em lote usa a mesma conta: no Sussurro cheio, cabem 0.
    expect(await vagasNoPlano(db, therapistId)).toEqual({ vagas: 0, plano: "Sussurro", ate: 11 });
    await sql`update assinaturas set plano = 'max' where "therapistId" = ${therapistId}`;
    await expect(exigirVagaNoPlano(db, therapistId)).resolves.toBeUndefined();
    expect(await vagasNoPlano(db, therapistId)).toEqual({ vagas: 11, plano: "Voz", ate: 22 });
  });

  it("a admin não tem teto também na importação", async () => {
    const { therapistId } = await novaPsicologa("99/100017", "admin");
    await pacientes(therapistId, 40);
    expect((await vagasNoPlano(db, therapistId)).vagas).toBeNull();
  });

  it("quem só participa de chamada em grupo (sem consulta própria) não entra na conta", async () => {
    const { therapistId } = await novaPsicologa("99/100008");
    await pacientes(therapistId, 2);
    const [titular, conjuge] = await sql`select id from patients where "therapistId" = ${therapistId} order by id`;
    const [consulta] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration)
                                 values (${therapistId}, ${titular.id}, now(), 50) returning id`;
    await sql`insert into "appointmentParticipants" ("appointmentId", "patientId") values (${consulta.id}, ${conjuge.id})`;
    expect(await contarPacientesCobrados(db, therapistId)).toBe(1);
  });
});
