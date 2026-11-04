/**
 * IDOR contra o Postgres real: uma conta tentando ler, mudar ou apagar dados de
 * OUTRA só trocando o número na chamada.
 *
 * - A: psicóloga dona de um paciente com consulta, sessão, anotação e documento.
 * - B: outra psicóloga, com assinatura em dia, que ataca tudo do A.
 * - P: o paciente do A (controle: ele PODE ver as próprias coisas).
 * - Q: um paciente qualquer, que ataca as coisas do P.
 *
 * Cada ataque pode falhar (erro) ou voltar vazio; o que não pode é devolver o
 * conteúdo do A (marcado com SEGREDO-A) ou mudar uma linha do A no banco. O
 * banco é fotografado antes e depois.
 *
 * Só roda com RUN_INTEGRATION=true e DATABASE_URL (CI ou Postgres de teste).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

const storageDuble = vi.hoisted(() => ({ chamadas: [] as string[] }));
vi.mock("./storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("./storage")>();
  const registrar = (nome: string) =>
    vi.fn(async (fileKey: string) => {
      storageDuble.chamadas.push(`${nome}:${fileKey}`);
      return nome === "download" ? Buffer.from("SEGREDO-A conteúdo do arquivo") : `https://assinada.test/${fileKey}`;
    });
  return {
    ...original,
    signDocumentUrl: registrar("assinar"),
    downloadDocumentFile: registrar("download"),
    apagarArquivoDoDocumento: registrar("apagar"),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { criarAssinaturaNaAprovacao } from "./assinaturas";

const RUN = process.env.RUN_INTEGRATION === "true" && Boolean(process.env.DATABASE_URL);

const ID = { A: 990101, B: 990102, P: 990103, Q: 990104 } as const;
const SEGREDO = "SEGREDO-A";

function ctx(userId: number, role: "therapist" | "user"): TrpcContext {
  return {
    user: {
      id: userId, openId: `sb:idor-${userId}`, email: `idor-${userId}@teste.local`, name: `IDOR ${userId}`,
      loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

/** Resultado de um ataque: o que voltou (ou o erro), sem deixar o teste cair. */
async function tentar(fn: () => Promise<unknown>): Promise<{ ok: boolean; valor: unknown }> {
  try {
    return { ok: true, valor: await fn() };
  } catch (erro) {
    return { ok: false, valor: (erro as Error).message };
  }
}

describe.runIf(RUN)("IDOR: ninguém mexe no que é de outra conta (Postgres real)", () => {
  let sql: ReturnType<typeof postgres>;
  const a = appRouter.createCaller(ctx(ID.A, "therapist"));
  const b = appRouter.createCaller(ctx(ID.B, "therapist"));
  const p = appRouter.createCaller(ctx(ID.P, "user"));
  const q = appRouter.createCaller(ctx(ID.Q, "user"));
  const alvo = { paciente: 0, pacienteDoB: 0, consulta: 0, sessao: 0, documento: 0, sala: "" };

  async function limpar() {
    for (const userId of [ID.A, ID.B]) {
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      if (!t) continue;
      await sql`delete from notifications where "appointmentId" in (select id from appointments where "therapistId" = ${t.id})`;
      await sql`delete from "sessionNotes" where "therapistId" = ${t.id}`;
      await sql`delete from documents where "therapistId" = ${t.id}`;
      await sql`delete from sessions where "therapistId" = ${t.id}`;
      await sql`delete from appointments where "therapistId" = ${t.id}`;
      await sql`delete from "chatMessages" where "therapistId" = ${t.id}`;
      await sql`delete from patients where "therapistId" = ${t.id}`;
      await sql`delete from assinaturas where "therapistId" = ${t.id}`;
      await sql`delete from therapists where id = ${t.id}`;
    }
    await sql`delete from assinaturas where crp in ('IDOR01', 'IDOR02')`;
    await sql`delete from users where id in ${sql(Object.values(ID))}`;
  }

  /** Tudo do A no banco, para comparar antes e depois dos ataques. */
  async function fotografia() {
    const [pac] = await sql`select * from patients where id = ${alvo.paciente}`;
    const [con] = await sql`select * from appointments where id = ${alvo.consulta}`;
    const ses = await sql`select * from sessions where "patientId" = ${alvo.paciente} order by id`;
    const notas = await sql`select * from "sessionNotes" where "patientId" = ${alvo.paciente} order by id`;
    const docs = await sql`select * from documents where "patientId" = ${alvo.paciente} order by id`;
    const participantes = await sql`select * from "appointmentParticipants" where "appointmentId" = ${alvo.consulta}`;
    return JSON.stringify({ pac, con, ses, notas, docs, participantes });
  }

  beforeAll(async () => {
    sql = postgres(process.env.DATABASE_URL as string, { prepare: false, max: 1 });
    await limpar();
    for (const [nome, id] of Object.entries(ID)) {
      await sql`insert into users (id, "openId", name, email, role)
                values (${id}, ${`sb:idor-${id}`}, ${`IDOR ${nome}`}, ${`idor-${id}@teste.local`}, ${nome === "A" || nome === "B" ? "therapist" : "user"})`;
    }
    const db = (await getDb())!;
    for (const [caller, userId, crp] of [[a, ID.A, "IDOR-01"], [b, ID.B, "IDOR-02"]] as const) {
      await caller.therapists.upsert({ crp });
      const [t] = await sql`select id from therapists where "userId" = ${userId}`;
      await criarAssinaturaNaAprovacao(db, { therapistId: t.id, crp, celular: null });
    }

    await a.patients.create({ firstName: SEGREDO, lastName: "Paciente", email: `idor-${ID.P}@teste.local` });
    alvo.paciente = (await a.patients.list())[0].id;
    await sql`update patients set "userId" = ${ID.P}, status = 'active' where id = ${alvo.paciente}`;
    await b.patients.create({ firstName: "Do", lastName: "B", email: "do-b@teste.local" });
    alvo.pacienteDoB = (await b.patients.list())[0].id;

    await a.appointments.create({ patientId: alvo.paciente, scheduledAt: new Date(Date.now() + 3_600_000).toISOString(), duration: 50 });
    alvo.consulta = (await a.appointments.list())[0].id;
    const [con] = await sql`select "roomToken" from appointments where id = ${alvo.consulta}`;
    alvo.sala = `apt${alvo.consulta}-${con.roomToken}`;

    await a.sessions.create({ patientId: alvo.paciente, clinicalNotes: `${SEGREDO} relato da sessão`, mood: "Estável" });
    alvo.sessao = (await a.sessions.getByPatient({ patientId: alvo.paciente }))[0].id;
    await a.sessionNotes.save({ appointmentId: alvo.consulta, patientId: alvo.paciente, notes: `${SEGREDO} anotação` });

    await a.documents.create({
      patientId: alvo.paciente, fileName: `${SEGREDO}-laudo.pdf`, fileKey: `idor-${ID.A}/${alvo.paciente}/1700000000000_laudo.pdf`,
      fileUrl: "x", fileType: "application/pdf", fileSize: 1024, documentType: "report",
    });
    alvo.documento = (await a.documents.getByPatient({ patientId: alvo.paciente }))[0].id;
  });

  afterAll(async () => {
    if (!sql) return;
    await limpar();
    await sql.end();
  });

  it("controle: o próprio paciente vê a consulta e entra na sala", async () => {
    expect((await p.me.appointments()).map((c: { id: number }) => c.id)).toContain(alvo.consulta);
    expect((await p.appointments.roomAccess({ roomId: alvo.sala })).allowed).toBe(true);
  });

  it("a outra psicóloga não lê, não muda e não apaga nada do paciente alheio", async () => {
    const antes = await fotografia();
    storageDuble.chamadas.length = 0;
    const ataques: Record<string, () => Promise<unknown>> = {
      "patients.get": () => b.patients.get({ id: alvo.paciente }),
      "patients.update": () => b.patients.update({ id: alvo.paciente, firstName: "HACK" }),
      "patients.delete": () => b.patients.delete({ id: alvo.paciente }),
      "patients.definirFrequencia": () => b.patients.definirFrequencia({ patientId: alvo.paciente, frequencia: null }),
      "sessions.getByPatient": () => b.sessions.getByPatient({ patientId: alvo.paciente }),
      "sessions.create": () => b.sessions.create({ patientId: alvo.paciente, clinicalNotes: "HACK" }),
      "sessions.classificar": () => b.sessions.classificar({ sessionId: alvo.sessao, moodScore: 1, fase: null }),
      "sessionNotes.getByPatient": () => b.sessionNotes.getByPatient({ patientId: alvo.paciente }),
      "sessionNotes.getByAppointment": () => b.sessionNotes.getByAppointment({ appointmentId: alvo.consulta }),
      "sessionNotes.save": () => b.sessionNotes.save({ appointmentId: alvo.consulta, patientId: alvo.paciente, notes: "HACK" }),
      "documents.getByPatient": () => b.documents.getByPatient({ patientId: alvo.paciente }),
      "documents.urlDoArquivo": () => b.documents.urlDoArquivo({ id: alvo.documento }),
      "documents.textoDoArquivo": () => b.documents.textoDoArquivo({ id: alvo.documento }),
      "documents.compartilhar": () => b.documents.compartilhar({ id: alvo.documento, tipo: null }),
      "documents.delete": () => b.documents.delete({ id: alvo.documento }),
      "documents.create": () =>
        b.documents.create({
          patientId: alvo.paciente, fileName: "x.pdf", fileKey: `idor-${ID.B}/${alvo.paciente}/1700000000000_x.pdf`,
          fileUrl: "x", fileType: "application/pdf", fileSize: 10, documentType: "report",
        }),
      "appointments.create": () =>
        b.appointments.create({ patientId: alvo.paciente, scheduledAt: new Date(Date.now() + 7_200_000).toISOString(), duration: 50 }),
      "appointments.updateStatus": () => b.appointments.updateStatus({ id: alvo.consulta, status: "cancelled" }),
      "appointments.editar": () => b.appointments.editar({ id: alvo.consulta, duration: 5 }),
      "appointments.setPayment": () => b.appointments.setPayment({ id: alvo.consulta, paid: true }),
      "appointments.recusarPagamentoInformado": () => b.appointments.recusarPagamentoInformado({ id: alvo.consulta }),
      "appointments.participantes": () => b.appointments.participantes({ appointmentId: alvo.consulta }),
      "appointments.adicionarParticipante": () =>
        b.appointments.adicionarParticipante({ appointmentId: alvo.consulta, patientId: alvo.pacienteDoB }),
      "appointments.removerParticipante": () =>
        b.appointments.removerParticipante({ appointmentId: alvo.consulta, patientId: alvo.paciente }),
      "videoCalls.getByPatient": () => b.videoCalls.getByPatient({ patientId: alvo.paciente }),
      "videoCalls.start": () => b.videoCalls.start({ appointmentId: alvo.consulta, patientId: alvo.paciente, roomId: alvo.sala }),
      "appointments.roomAccess": () => b.appointments.roomAccess({ roomId: alvo.sala }),
      "chat.messages": () => b.chat.messages({ patientId: alvo.paciente }),
    };

    const vazamentos: string[] = [];
    for (const [nome, ataque] of Object.entries(ataques)) {
      const r = await tentar(ataque);
      if (r.ok && JSON.stringify(r.valor ?? null).includes(SEGREDO)) vazamentos.push(`${nome} devolveu dado do A`);
      if (nome === "appointments.roomAccess" && r.ok && (r.valor as { allowed?: boolean }).allowed) vazamentos.push("B entrou na sala do A");
    }
    expect(vazamentos).toEqual([]);
    // Nenhuma linha do A mudou, e nenhum arquivo do A foi assinado, baixado ou apagado.
    expect(await fotografia()).toBe(antes);
    expect(storageDuble.chamadas.filter((c) => c.includes(`idor-${ID.A}/`))).toEqual([]);
    // E as listas do B não trazem nada do A.
    expect(JSON.stringify(await b.patients.list())).not.toContain(SEGREDO);
    expect((await b.appointments.list()).map((c: { id: number }) => c.id)).not.toContain(alvo.consulta);
    expect(JSON.stringify(await b.sessions.list())).not.toContain(SEGREDO);
  });

  it("outro paciente não vê nem mexe na consulta, no documento e na sala do paciente alheio", async () => {
    await a.documents.compartilhar({ id: alvo.documento, tipo: "laudo" });
    expect((await p.me.documentos()).map((d: { id: number }) => d.id)).toContain(alvo.documento);

    const antes = await fotografia();
    storageDuble.chamadas.length = 0;
    const vazamentos: string[] = [];
    const ataques: Record<string, () => Promise<unknown>> = {
      "me.appointments": () => q.me.appointments(),
      "me.documentos": () => q.me.documentos(),
      "me.urlDoDocumento": () => q.me.urlDoDocumento({ id: alvo.documento }),
      "me.confirmAppointment": () => q.me.confirmAppointment({ appointmentId: alvo.consulta }),
      "me.informarPagamento": () => q.me.informarPagamento({ appointmentId: alvo.consulta }),
      "appointments.roomAccess": () => q.appointments.roomAccess({ roomId: alvo.sala }),
      "chat.messages": () => q.chat.messages({ patientId: alvo.paciente }),
    };
    for (const [nome, ataque] of Object.entries(ataques)) {
      const r = await tentar(ataque);
      const texto = JSON.stringify(r.valor ?? null);
      if (r.ok && (texto.includes(SEGREDO) || texto.includes(`"id":${alvo.consulta},`))) vazamentos.push(`${nome} devolveu dado do P`);
      if (nome === "appointments.roomAccess" && r.ok && (r.valor as { allowed?: boolean }).allowed) vazamentos.push("Q entrou na sala do P");
    }
    expect(vazamentos).toEqual([]);
    expect(await fotografia()).toBe(antes);
    expect(storageDuble.chamadas).toEqual([]);
  });
});
