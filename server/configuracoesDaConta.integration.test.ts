/**
 * Configurações da conta contra o Postgres real: aparelhos conectados, sair de
 * todos, avisos por e-mail e "baixar meus dados". O foco é o escopo (ninguém mexe
 * no aparelho ou nos dados de outra conta) e o efeito na hora (aparelho removido
 * perde o acesso já, não depois do cache).
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { aparelhoLiberado, COOKIE_DO_APARELHO, confirmarCodigoDeAparelho } from "./aparelhos";
import { createHash } from "node:crypto";
import { getDb } from "./db";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const ID = { ANA: 990501, BIA: 990502, PAC: 990503 } as const;
const HORA = 60 * 60 * 1000;

function ctx(userId: number, role: "therapist" | "user", cookie = ""): TrpcContext {
  return {
    user: {
      id: userId, openId: `sb:conf-${userId}`, email: `conf-${userId}@teste.local`, name: `Conf ${userId}`,
      loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: { cookie, "user-agent": "" }, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe.runIf(RUN)("configurações da conta (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const tokens: Record<string, string> = {};

  /** Confirma um aparelho com um código conhecido, como faria a tela. */
  async function aparelhoConfirmado(userId: number, navegador: string) {
    const codigo = "123456";
    await sql`insert into "codigosDeAparelho" ("userId", "codigoHash", "expiraEm", tentativas)
              values (${userId}, ${createHash("sha256").update(codigo).digest("hex")}, ${new Date(Date.now() + HORA)}, 0)
              on conflict ("userId") do update set "codigoHash" = excluded."codigoHash", "expiraEm" = excluded."expiraEm", tentativas = 0`;
    return confirmarCodigoDeAparelho(userId, codigo, true, new Date(), navegador);
  }
  const cookieDe = (token: string) => `${COOKIE_DO_APARELHO}=${token}`;
  const liberado = (userId: number, token: string) =>
    aparelhoLiberado({ id: userId, role: "therapist" }, cookieDe(token), new Date());

  async function limpar() {
    const ts = await sql`select id from therapists where "userId" in ${sql([ID.ANA, ID.BIA])}`;
    for (const t of ts) {
      await sql`delete from appointments where "therapistId" = ${t.id}`;
      await sql`delete from patients where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  beforeAll(async () => {
    // A conexão abre ANTES de simular produção: em produção o driver exige SSL,
    // que o Postgres de teste não tem. A verificação de aparelho só vale em produção.
    await getDb();
    vi.stubEnv("NODE_ENV", "production");
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const [nome, id] of Object.entries(ID)) {
      await sql`insert into users (id, "openId", name, email, role)
                values (${id}, ${`sb:conf-${id}`}, ${`Conf ${nome}`}, ${`conf-${id}@teste.local`}, ${nome === "PAC" ? "user" : "therapist"})`;
    }
    tokens.anaChrome = await aparelhoConfirmado(ID.ANA, "Chrome no Windows");
    tokens.anaIphone = await aparelhoConfirmado(ID.ANA, "Safari no iPhone");
    tokens.bia = await aparelhoConfirmado(ID.BIA, "Opera no Windows");
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("lista só os aparelhos da conta, com o nome e o atual marcado", async () => {
    const lista = await appRouter.createCaller(ctx(ID.ANA, "therapist", cookieDe(tokens.anaChrome))).aparelho.listar();
    expect(lista.map((a) => [a.navegador, a.esteAparelho])).toEqual([
      ["Chrome no Windows", true],
      ["Safari no iPhone", false],
    ]);
    expect(JSON.stringify(lista)).not.toMatch(/tokenHash|Opera/);
  });

  it("ninguém remove o aparelho de outra conta", async () => {
    const [daBia] = await sql`select id from "aparelhosConfiaveis" where "userId" = ${ID.BIA}`;
    await expect(appRouter.createCaller(ctx(ID.ANA, "therapist")).aparelho.remover({ id: daBia.id })).rejects.toThrow(/não encontrado/);
    expect(await liberado(ID.BIA, tokens.bia)).toBe(true);
  });

  it("aparelho removido perde o acesso na hora, mesmo já validado (cache)", async () => {
    expect(await liberado(ID.ANA, tokens.anaIphone)).toBe(true); // entra no cache
    const lista = await appRouter.createCaller(ctx(ID.ANA, "therapist", cookieDe(tokens.anaChrome))).aparelho.listar();
    const iphone = lista.find((a) => a.navegador === "Safari no iPhone")!;
    await appRouter.createCaller(ctx(ID.ANA, "therapist")).aparelho.remover({ id: iphone.id });
    expect(await liberado(ID.ANA, tokens.anaIphone)).toBe(false);
    expect(await liberado(ID.ANA, tokens.anaChrome)).toBe(true);
  });

  it("sair de todos derruba todos os aparelhos da conta, e só os dela", async () => {
    expect(await liberado(ID.ANA, tokens.anaChrome)).toBe(true);
    const contexto = ctx(ID.ANA, "therapist", cookieDe(tokens.anaChrome));
    expect(await appRouter.createCaller(contexto).aparelho.sairDeTodos()).toEqual({ removidos: 1 });
    expect(contexto.res.clearCookie).toHaveBeenCalledWith(COOKIE_DO_APARELHO, expect.objectContaining({ path: "/api" }));
    expect(await liberado(ID.ANA, tokens.anaChrome)).toBe(false);
    expect(await liberado(ID.BIA, tokens.bia)).toBe(true);
  });

  it("o último uso é gravado quando o aparelho volta a ser usado", async () => {
    // Aparelho novo, ainda fora do cache, com o último uso de 3 horas atrás.
    const token = await aparelhoConfirmado(ID.BIA, "Edge no Windows");
    await sql`update "aparelhosConfiaveis" set "ultimoUsoEm" = ${new Date(Date.now() - 3 * HORA)} where navegador = 'Edge no Windows' and "userId" = ${ID.BIA}`;
    expect(await liberado(ID.BIA, token)).toBe(true);
    const [a] = await sql`select "ultimoUsoEm" from "aparelhosConfiaveis" where navegador = 'Edge no Windows' and "userId" = ${ID.BIA}`;
    expect(Date.now() - new Date(a.ultimoUsoEm).getTime()).toBeLessThan(60_000);
  });

  it("aparelho confirmado antes de existir o nome do navegador ganha o nome no próximo uso", async () => {
    const token = await aparelhoConfirmado(ID.BIA, "provisorio");
    await sql`update "aparelhosConfiaveis" set navegador = null where navegador = 'provisorio' and "userId" = ${ID.BIA}`;
    expect(await aparelhoLiberado({ id: ID.BIA, role: "therapist" }, cookieDe(token), new Date(), "Opera no Windows")).toBe(true);
    const lista = await appRouter.createCaller(ctx(ID.BIA, "therapist", cookieDe(token))).aparelho.listar();
    expect(lista.find((a) => a.esteAparelho)?.navegador).toBe("Opera no Windows");
  });

  it("paciente: aparelhos = logins abertos no Supabase, só os da conta, e sai de um deles", async () => {
    // No Supabase de verdade a tabela já existe; no Postgres do CI, cria o essencial.
    await sql`create schema if not exists auth`;
    await sql`create table if not exists auth.sessions (
      id uuid primary key, user_id uuid not null, created_at timestamptz, updated_at timestamptz,
      refreshed_at timestamp, user_agent text, not_after timestamptz)`;
    const uidPac = "a0000000-0000-4000-8000-000000000001";
    const uidOutro = "a0000000-0000-4000-8000-000000000002";
    const [s1, s2, s3, sOutro] = [
      "b0000000-0000-4000-8000-000000000001", "b0000000-0000-4000-8000-000000000002",
      "b0000000-0000-4000-8000-000000000003", "b0000000-0000-4000-8000-000000000004",
    ];
    await sql`delete from auth.sessions where user_id in ${sql([uidPac, uidOutro])}`;
    const opera = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 OPR/115.0";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";
    await sql`insert into auth.sessions (id, user_id, created_at, updated_at, user_agent, not_after) values
      (${s1}, ${uidPac}, now() - interval '1 day', now(), ${opera}, null),
      (${s2}, ${uidPac}, now() - interval '3 day', now() - interval '2 day', ${iphone}, null),
      (${s3}, ${uidPac}, now() - interval '9 day', now() - interval '9 day', ${opera}, now() - interval '1 day'),
      (${sOutro}, ${uidOutro}, now(), now(), ${opera}, null)`;

    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const contexto = ctx(ID.PAC, "user");
    contexto.user!.openId = `sb:${uidPac}`;
    (contexto.req.headers as Record<string, string>).authorization = `Bearer ${b64({ alg: "ES256" })}.${b64({ session_id: s1 })}.x`;
    const pac = appRouter.createCaller(contexto);

    // Vencida (not_after no passado) e a de outra conta ficam de fora.
    const lista = await pac.aparelho.sessoes();
    expect(lista.map((s) => [s.id, s.navegador, s.estaSessao])).toEqual([
      [s1, "Opera no Windows", true],
      [s2, "Safari no iPhone", false],
    ]);

    await expect(pac.aparelho.encerrarSessao({ id: sOutro })).rejects.toThrow(/não encontrado/);
    await pac.aparelho.encerrarSessao({ id: s2 });
    expect((await pac.aparelho.sessoes()).map((s) => s.id)).toEqual([s1]);
    expect(await sql`select id from auth.sessions where id = ${sOutro}`).toHaveLength(1);
    await sql`delete from auth.sessions where user_id in ${sql([uidPac, uidOutro])}`;
  });

  it("excluir paciente: sem prontuário apaga ficha e consultas; com prontuário recusa e só arquiva", async () => {
    const [t] = await sql`insert into therapists ("userId", crp) values (${ID.ANA}, '99/500001') returning id`;
    const ana = appRouter.createCaller(ctx(ID.ANA, "therapist"));

    // Só consulta agendada (com participante e aviso): sai tudo.
    const [semProntuario] = await sql`insert into patients ("therapistId", "firstName", "lastName", email)
                                      values (${t.id}, 'Sem', 'Prontuario', 'sem-pront@teste.local') returning id`;
    const [extra] = await sql`insert into patients ("therapistId", "firstName", "lastName", email)
                              values (${t.id}, 'Extra', 'Grupo', 'extra-grupo@teste.local') returning id`;
    const [agendada] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration)
                                 values (${t.id}, ${semProntuario.id}, now() + interval '1 day', 50) returning id`;
    await sql`insert into "appointmentParticipants" ("appointmentId", "patientId") values (${agendada.id}, ${extra.id})`;
    await sql`insert into notifications ("appointmentId", "recipientType", "recipientEmail", "notificationType")
              values (${agendada.id}, 'patient', 'sem-pront@teste.local', 'appointment_reminder')`;
    expect(await ana.patients.delete({ id: semProntuario.id })).toEqual({ action: "deleted", consultas: 1 });
    expect(await sql`select id from patients where id = ${semProntuario.id}`).toHaveLength(0);
    expect(await sql`select id from appointments where id = ${agendada.id}`).toHaveLength(0);
    expect(await sql`select id from notifications where "appointmentId" = ${agendada.id}`).toHaveLength(0);
    expect(await sql`select id from "appointmentParticipants" where "appointmentId" = ${agendada.id}`).toHaveLength(0);
    expect(await sql`select id from patients where id = ${extra.id}`).toHaveLength(1);

    // Consulta realizada é prontuário: excluir recusa e nada muda; arquivar funciona.
    const [comProntuario] = await sql`insert into patients ("therapistId", "firstName", "lastName", email)
                                      values (${t.id}, 'Com', 'Prontuario', 'com-pront@teste.local') returning id`;
    await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, status)
              values (${t.id}, ${comProntuario.id}, now() - interval '1 day', 50, 'completed')`;
    await expect(ana.patients.delete({ id: comProntuario.id })).rejects.toThrow(/CFP 001\/2009.*Arquivar/);
    expect(await sql`select status from patients where id = ${comProntuario.id}`).toEqual([{ status: "active" }]);
    await ana.patients.update({ id: comProntuario.id, status: "archived" });
    expect(await sql`select status from patients where id = ${comProntuario.id}`).toEqual([{ status: "archived" }]);

    // Reativar: sem conta volta "Aguardando cadastro"; com conta, "Ativo".
    await ana.patients.update({ id: comProntuario.id, status: "active" });
    expect(await sql`select status from patients where id = ${comProntuario.id}`).toEqual([{ status: "pending" }]);
    await sql`update patients set status = 'archived', "userId" = ${ID.PAC} where id = ${comProntuario.id}`;
    await ana.patients.update({ id: comProntuario.id, status: "active" });
    expect(await sql`select status from patients where id = ${comProntuario.id}`).toEqual([{ status: "active" }]);
    await sql`update patients set "userId" = null where id = ${comProntuario.id}`;

    // Paciente de outra psicóloga: nem excluir.
    await expect(appRouter.createCaller(ctx(ID.BIA, "therapist")).patients.delete({ id: extra.id })).rejects.toThrow();
  });

  it("avisos por e-mail: cada conta guarda os próprios, e o padrão é tudo ligado", async () => {
    const ana = appRouter.createCaller(ctx(ID.ANA, "therapist"));
    const bia = appRouter.createCaller(ctx(ID.BIA, "therapist"));
    expect(await ana.me.avisosPorEmail()).toEqual({ lembrete: true, consultaNova: true, cancelamento: true });
    await ana.me.definirAvisosPorEmail({ lembrete: false, consultaNova: true, cancelamento: false });
    expect(await ana.me.avisosPorEmail()).toEqual({ lembrete: false, consultaNova: true, cancelamento: false });
    expect(await bia.me.avisosPorEmail()).toEqual({ lembrete: true, consultaNova: true, cancelamento: true });
  });

  it("baixar meus dados: o paciente leva as próprias consultas e nada de outra conta", async () => {
    const [t] = await sql`insert into therapists ("userId", crp) values (${ID.BIA}, '99/500002') returning id`;
    const [pac] = await sql`insert into patients ("therapistId", "firstName", "lastName", email, "userId")
                            values (${t.id}, 'Paciente', 'Conf', ${`conf-${ID.PAC}@teste.local`}, ${ID.PAC}) returning id`;
    const [outro] = await sql`insert into patients ("therapistId", "firstName", "lastName", email)
                              values (${t.id}, 'OUTRO-PACIENTE', 'X', 'outro-conf@teste.local') returning id`;
    await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration) values (${t.id}, ${pac.id}, now(), 50)`;
    await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration) values (${t.id}, ${outro.id}, now(), 50)`;

    const doPaciente = await appRouter.createCaller(ctx(ID.PAC, "user")).me.exportarMeusDados();
    expect((doPaciente.consultas as unknown[]).length).toBe(1);
    expect(JSON.stringify(doPaciente)).not.toContain("OUTRO-PACIENTE");
    expect(doPaciente.perfilProfissional).toBeUndefined();

    // A psicóloga leva a conta e o perfil, mas não os pacientes.
    const daPsicologa = await appRouter.createCaller(ctx(ID.BIA, "therapist")).me.exportarMeusDados();
    expect(daPsicologa.perfilProfissional).toMatchObject({ crp: "99/500002" });
    expect(JSON.stringify(daPsicologa)).not.toMatch(/OUTRO-PACIENTE|Paciente/);
    expect(JSON.stringify(daPsicologa)).not.toMatch(/tokenHash|codigoHash/);
  });
});
