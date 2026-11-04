/**
 * Lembretes e avisos por e-mail contra o Postgres real: sai um por pessoa, na
 * hora certa, sem repetir e sem sair para quem não deve. Erro aqui é paciente
 * sem lembrete (falta à consulta) ou caixa de entrada lotada (e-mail repetido).
 *
 * O envio é um dublê: o teste confere a FILA (tabela notifications) e o status
 * que cada envio deixa. Só roda com RUN_INTEGRATION=true e DATABASE_URL.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const correio = vi.hoisted(() => ({ enviados: [] as string[], falhar: new Set<string>(), semConfiguracao: new Set<string>() }));
vi.mock("./mailer", async (importOriginal) => {
  const original = await importOriginal<typeof import("./mailer")>();
  return {
    ...original,
    sendEmail: vi.fn(async (para: string) => {
      if (correio.falhar.has(para)) throw new Error("caixa cheia");
      if (correio.semConfiguracao.has(para)) return false;
      correio.enviados.push(para);
      return true;
    }),
  };
});

import {
  processPendingNotifications,
  sendAppointmentReminders,
  sendCancellationAlerts,
  sendTherapistAlerts,
} from "./notifications";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);
const USER_ID = 990301;
const HORA = 60 * 60 * 1000;
const EMAIL_PSI = "psi-notif@teste.local";
const EMAIL_PAC = "pac-notif@teste.local";

describe.runIf(RUN)("lembretes e avisos por e-mail (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  let therapistId = 0;
  let patientId = 0;
  const consulta = { daquiA3h: 0, daquiA30h: 0, passada: 0, cancelada: 0, semanal: [] as number[] };

  async function limpar() {
    const [t] = await sql`select id from therapists where "userId" = ${USER_ID}`;
    if (t) {
      await sql`delete from notifications where "appointmentId" in (select id from appointments where "therapistId" = ${t.id})`;
      await sql`delete from appointments where "therapistId" = ${t.id}`;
      await sql`delete from patients where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from users where id = ${USER_ID}`;
  }

  async function agendar(emHoras: number, status = "scheduled", criadaEm = new Date()) {
    const [a] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, status, "createdAt", "updatedAt")
                          values (${therapistId}, ${patientId}, ${new Date(Date.now() + emHoras * HORA)}, 50, ${status}, ${criadaEm}, now())
                          returning id`;
    return a.id as number;
  }

  /** Avisos de um tipo para as consultas dadas: "patient"/"therapist" de cada um. */
  async function avisos(tipo: string, ids: number[]) {
    const linhas = await sql`select "appointmentId", "recipientType", "recipientEmail", status from notifications
                             where "notificationType" = ${tipo} and "appointmentId" in ${sql(ids)} order by "appointmentId", "recipientType"`;
    return linhas.map((l) => `${l.appointmentId}:${l.recipientType}`).sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    await sql`insert into users (id, "openId", name, email, role) values (${USER_ID}, 'sb:notif', 'Psi Notif', ${EMAIL_PSI}, 'therapist')`;
    [{ id: therapistId }] = await sql`insert into therapists ("userId", crp) values (${USER_ID}, '99/300001') returning id`;
    [{ id: patientId }] = await sql`insert into patients ("therapistId", "firstName", "lastName", email) values (${therapistId}, 'Pac', 'Notif', ${EMAIL_PAC}) returning id`;
    // Criadas em momentos diferentes: o aviso de consulta nova junta num LOTE as
    // consultas do mesmo paciente criadas no mesmo segundo (o "repetir por N semanas").
    consulta.daquiA3h = await agendar(3, "scheduled", new Date(Date.now() - 20 * 60_000));
    consulta.daquiA30h = await agendar(30, "scheduled", new Date(Date.now() - 10 * 60_000));
    consulta.passada = await agendar(-2);
    consulta.cancelada = await agendar(5, "cancelled");
    // Semanal: 4 consultas criadas no mesmo instante (o "repetir por 4 semanas").
    const lote = new Date(Date.now() - HORA);
    for (const semana of [0, 1, 2, 3]) consulta.semanal.push(await agendar(48 + semana * 24 * 7, "scheduled", lote));
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("lembrete da véspera: um para cada lado, só para quem está nas próximas ~26h", async () => {
    await sendAppointmentReminders();
    await sendAppointmentReminders(); // o ciclo roda a cada 15 min: não pode repetir
    const ids = [consulta.daquiA3h, consulta.daquiA30h, consulta.passada, consulta.cancelada, ...consulta.semanal];
    expect(await avisos("appointment_reminder", ids)).toEqual([`${consulta.daquiA3h}:patient`, `${consulta.daquiA3h}:therapist`]);
  });

  it("consulta nova: um aviso por lote para cada lado, preso à primeira data; passada e cancelada não avisam", async () => {
    await sendTherapistAlerts();
    await sendTherapistAlerts();
    const ids = [consulta.daquiA3h, consulta.daquiA30h, consulta.passada, consulta.cancelada, ...consulta.semanal];
    expect(await avisos("new_appointment", ids)).toEqual([
      `${consulta.daquiA3h}:patient`, `${consulta.daquiA3h}:therapist`,
      `${consulta.daquiA30h}:patient`, `${consulta.daquiA30h}:therapist`,
      `${consulta.semanal[0]}:patient`, `${consulta.semanal[0]}:therapist`,
    ]);
  });

  it("cancelamento avisa os dois lados uma vez, mesmo se o ciclo rodar de novo", async () => {
    await sendCancellationAlerts();
    await sendCancellationAlerts();
    expect(await avisos("appointment_cancelled", [consulta.cancelada])).toEqual([
      `${consulta.cancelada}:patient`, `${consulta.cancelada}:therapist`,
    ]);
  });

  it("a fila marca enviado, falha (com o motivo) ou deixa pendente quando o e-mail não está configurado", async () => {
    correio.falhar.add(EMAIL_PSI);
    await processPendingNotifications(500);
    const status = async (email: string) =>
      (await sql`select distinct n.status from notifications n join appointments a on a.id = n."appointmentId"
                 where a."therapistId" = ${therapistId} and n."recipientEmail" = ${email}`).map((l) => l.status);
    expect(await status(EMAIL_PAC)).toEqual(["sent"]);
    expect(await status(EMAIL_PSI)).toEqual(["failed"]);
    const [erro] = await sql`select "errorMessage" from notifications where "recipientEmail" = ${EMAIL_PSI} limit 1`;
    expect(erro.errorMessage).toContain("caixa cheia");

    // Sem e-mail configurado (dry-run): fica pendente para sair depois.
    correio.falhar.clear();
    correio.semConfiguracao.add(EMAIL_PAC);
    await sql`update notifications set status = 'pending' where "recipientEmail" = ${EMAIL_PAC}`;
    await processPendingNotifications(500);
    expect(await status(EMAIL_PAC)).toEqual(["pending"]);
  });
});
