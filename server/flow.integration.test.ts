import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Teste de integração: exercita os fluxos principais contra um Postgres REAL.
// Só roda com RUN_INTEGRATION=true + DATABASE_URL definido (ex.: no CI). Assim
// não interfere no `pnpm test` normal (sem banco) nem toca o banco de produção
// por acidente.
const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);

// userId dedicado ao teste (evita colidir com dados reais; limpo no setup/teardown).
const TEST_USER_ID = 990001;
const TEST_EMAIL = `int-${TEST_USER_ID}@test.local`;

function ctxFor(userId: number): TrpcContext {
  const user: NonNullable<TrpcContext["user"]> = {
    id: userId,
    openId: `it-${userId}`,
    email: "it@test.local",
    name: "Integração",
    loginMethod: "test",
    role: "therapist",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe.runIf(RUN)("fluxo de integração (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const caller = appRouter.createCaller(ctxFor(TEST_USER_ID));
  let patientId = 0;
  let appointmentId = 0;

  async function cleanup() {
    const t = await sql`select id from therapists where "userId" = ${TEST_USER_ID}`;
    if (t.length) {
      const tid = t[0].id;
      await sql`delete from notifications where "appointmentId" in (select id from appointments where "therapistId" = ${tid})`;
      await sql`delete from documents where "therapistId" = ${tid}`;
      await sql`delete from "sessionNotes" where "therapistId" = ${tid}`;
      await sql`delete from sessions where "therapistId" = ${tid}`;
      await sql`delete from appointments where "therapistId" = ${tid}`;
      await sql`delete from patients where "therapistId" = ${tid}`;
      await sql`delete from therapists where id = ${tid}`;
    }
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await cleanup();
  });

  afterAll(async () => {
    if (sql) {
      await cleanup();
      await sql.end();
    }
  });

  it("cria o perfil da psicóloga (therapists.upsert/me)", async () => {
    const r = await caller.therapists.upsert({ crp: "IT-0001", specialties: "TCC" });
    expect(r.success).toBe(true);
    const me = await caller.therapists.me();
    expect(me?.crp).toBe("IT-0001");
  });

  it("cadastra, lista e edita um paciente", async () => {
    await caller.patients.create({ firstName: "Int", lastName: "Test", email: TEST_EMAIL });
    const list = await caller.patients.list();
    expect(list.length).toBe(1);
    patientId = list[0].id;

    await caller.patients.update({ id: patientId, firstName: "IntEditado" });
    const p = await caller.patients.get({ id: patientId });
    expect(p?.firstName).toBe("IntEditado");
  });

  it("agenda, confirma presença e conclui a consulta", async () => {
    await caller.appointments.create({
      patientId,
      scheduledAt: new Date().toISOString(),
      duration: 60,
    });
    const list = await caller.appointments.list();
    expect(list.length).toBe(1);
    appointmentId = list[0].id;

    await caller.appointments.confirm({ id: appointmentId, roomId: `sala-apt${appointmentId}` });
    await caller.appointments.updateStatus({ id: appointmentId, status: "completed" });

    const after = await caller.appointments.list();
    expect(after[0].status).toBe("completed");
    expect(after[0].confirmedAt).not.toBeNull();
  });

  it("rejeita confirmação com sala inválida", async () => {
    await expect(
      caller.appointments.confirm({ id: appointmentId, roomId: "sala-errada" }),
    ).rejects.toThrow("Sala inválida");
  });

  it("registra sessão e documento do paciente", async () => {
    await caller.sessions.create({ patientId, clinicalNotes: "Sessão de integração", mood: "Estável" });
    const sessions = await caller.sessions.getByPatient({ patientId });
    expect(sessions.length).toBe(1);
    expect(sessions[0].clinicalNotes).toContain("integração");

    await caller.documents.create({
      patientId,
      fileName: "laudo.pdf",
      fileKey: "test/key",
      fileUrl: "test/key",
      fileType: "application/pdf",
      fileSize: 1024,
      documentType: "report",
    });
    const docs = await caller.documents.getByPatient({ patientId });
    expect(docs.length).toBe(1);

    const del = await caller.documents.delete({ id: docs[0].id });
    expect(del.success).toBe(true);
    expect(del.fileKey).toBe("test/key");
  });

  it("impede acesso a paciente de outro terapeuta (IDOR)", async () => {
    const outroCaller = appRouter.createCaller(ctxFor(TEST_USER_ID + 1));
    // Sem perfil de terapeuta, o get retorna null (não vaza dados).
    const p = await outroCaller.patients.get({ id: patientId });
    expect(p).toBeNull();
  });
});
