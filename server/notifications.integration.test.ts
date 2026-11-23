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
  enviarResumoDeAmanha,
  processPendingNotifications,
  sendAppointmentReminders,
  sendCancellationAlerts,
  sendTherapistAlerts,
} from "./notifications";
import { instanteEmBrasilia } from "../shared/datas";
import { hojeEmBrasilia, somarDias } from "../shared/lembretesDoDia";

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
    await sql`delete from users where id in (${USER_ID}, ${USER_ID + 1})`;
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

  // Desde 2026-11-24 (cota da Brevo) a psicóloga não recebe esses três por consulta:
  // ela recebe um resumo por dia (enviarResumoDeAmanha, testado abaixo).
  it("lembrete da véspera: só para o paciente, só para quem está nas próximas ~26h", async () => {
    await sendAppointmentReminders();
    await sendAppointmentReminders(); // o ciclo roda a cada 15 min: não pode repetir
    const ids = [consulta.daquiA3h, consulta.daquiA30h, consulta.passada, consulta.cancelada, ...consulta.semanal];
    expect(await avisos("appointment_reminder", ids)).toEqual([`${consulta.daquiA3h}:patient`]);
  });

  it("consulta nova: um aviso por lote, só para o paciente, preso à primeira data; passada e cancelada não avisam", async () => {
    await sendTherapistAlerts();
    await sendTherapistAlerts();
    const ids = [consulta.daquiA3h, consulta.daquiA30h, consulta.passada, consulta.cancelada, ...consulta.semanal];
    expect(await avisos("new_appointment", ids)).toEqual([
      `${consulta.daquiA3h}:patient`,
      `${consulta.daquiA30h}:patient`,
      `${consulta.semanal[0]}:patient`,
    ]);
  });

  it("cancelamento avisa o paciente uma vez, mesmo se o ciclo rodar de novo", async () => {
    await sendCancellationAlerts();
    await sendCancellationAlerts();
    expect(await avisos("appointment_cancelled", [consulta.cancelada])).toEqual([`${consulta.cancelada}:patient`]);
  });

  it("resumo de amanhã: um e-mail por dia para a psicóloga, só a partir das 18h de Brasília", async () => {
    const hoje = hojeEmBrasilia();
    const amanha = somarDias(hoje, 1);
    const criadas: number[] = [];
    for (const hora of ["07:00", "15:00"]) {
      const [c] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, "createdAt")
                            values (${therapistId}, ${patientId}, ${instanteEmBrasilia(amanha, hora)}, 50, now() - interval '3 days') returning id`;
      criadas.push(c.id);
    }
    const antes = correio.enviados.filter((e) => e === EMAIL_PSI).length;

    // O banco de teste pode ter outras psicólogas com consulta amanhã: conta só os desta.
    const dela = () => correio.enviados.filter((e) => e === EMAIL_PSI).length - antes;
    expect(await enviarResumoDeAmanha(instanteEmBrasilia(hoje, "17:00"))).toBe(0); // antes das 18h
    expect(dela()).toBe(0);
    await enviarResumoDeAmanha(instanteEmBrasilia(hoje, "18:30"));
    expect(dela()).toBe(1);
    await enviarResumoDeAmanha(instanteEmBrasilia(hoje, "19:00")); // o ciclo roda de novo: não repete
    expect(dela()).toBe(1);

    // A marca fica na PRIMEIRA consulta de amanhã (depende da hora em que o teste roda).
    const [primeira] = await sql`select id from appointments where "therapistId" = ${therapistId} and status = 'scheduled'
                                 and "scheduledAt" >= ${instanteEmBrasilia(amanha, "00:00")} order by "scheduledAt" limit 1`;
    const marcas = await sql`select "appointmentId", status from notifications
                             where "recipientType" = 'therapist' and "notificationType" = 'appointment_reminder'
                             and "appointmentId" in (select id from appointments where "therapistId" = ${therapistId})`;
    expect(marcas.map((m) => [m.appointmentId, m.status])).toEqual([[primeira.id, "sent"]]);

    await sql`delete from notifications where "recipientType" = 'therapist' and "notificationType" = 'appointment_reminder'
              and "appointmentId" in (select id from appointments where "therapistId" = ${therapistId})`;
    await sql`delete from notifications where "appointmentId" in ${sql(criadas)}`;
    await sql`delete from appointments where id in ${sql(criadas)}`;
  });

  it("quem desligou um aviso nas Configurações não recebe esse aviso", async () => {
    // Paciente com conta que desligou o lembrete e o aviso de cancelamento.
    await sql`insert into users (id, "openId", name, email, role, "avisosPorEmail")
              values (${USER_ID + 1}, 'sb:notif-pac', 'Pac Prefere', 'pac-prefere@teste.local', 'user', ${sql.json({ lembrete: false, cancelamento: false })})`;
    const [pac] = await sql`insert into patients ("therapistId", "firstName", "lastName", email, "userId")
                            values (${therapistId}, 'Pac', 'Prefere', 'pac-prefere@teste.local', ${USER_ID + 1}) returning id`;
    const [lembrar] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, "createdAt")
                                values (${therapistId}, ${pac.id}, ${new Date(Date.now() + 4 * HORA)}, 50, ${new Date(Date.now() - 30 * 60_000)}) returning id`;
    const [cancelar] = await sql`insert into appointments ("therapistId", "patientId", "scheduledAt", duration, status, "createdAt")
                                 values (${therapistId}, ${pac.id}, ${new Date(Date.now() + 50 * HORA)}, 50, 'cancelled', ${new Date(Date.now() - 40 * 60_000)}) returning id`;
    await sendAppointmentReminders();
    await sendTherapistAlerts();
    await sendCancellationAlerts();
    expect(await avisos("appointment_reminder", [lembrar.id])).toEqual([]);
    expect(await avisos("appointment_cancelled", [cancelar.id])).toEqual([]);
    // "Consulta marcada" ele deixou ligado: chega.
    expect(await avisos("new_appointment", [lembrar.id])).toEqual([`${lembrar.id}:patient`]);
  });

  it("a fila marca enviado, falha (com o motivo) ou deixa pendente quando o e-mail não está configurado", async () => {
    const PREFERE = "pac-prefere@teste.local";
    correio.falhar.add(PREFERE);
    await processPendingNotifications(500);
    const status = async (email: string) =>
      (await sql`select distinct n.status from notifications n join appointments a on a.id = n."appointmentId"
                 where a."therapistId" = ${therapistId} and n."recipientEmail" = ${email}`).map((l) => l.status);
    expect(await status(EMAIL_PAC)).toEqual(["sent"]);
    expect(await status(PREFERE)).toEqual(["failed"]);
    // A psicóloga não entra mais na fila de avisos por consulta.
    expect(await status(EMAIL_PSI)).toEqual([]);
    const [erro] = await sql`select "errorMessage" from notifications where "recipientEmail" = ${PREFERE} limit 1`;
    expect(erro.errorMessage).toContain("caixa cheia");

    // Sem e-mail configurado (dry-run): fica pendente para sair depois.
    correio.falhar.clear();
    correio.semConfiguracao.add(EMAIL_PAC);
    await sql`update notifications set status = 'pending' where "recipientEmail" = ${EMAIL_PAC}`;
    await processPendingNotifications(500);
    expect(await status(EMAIL_PAC)).toEqual(["pending"]);
  });
});
