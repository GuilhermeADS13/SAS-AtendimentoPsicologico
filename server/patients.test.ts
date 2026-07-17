import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(
  userId: number = 1,
  role: AuthenticatedUser["role"] = "therapist",
): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("patients router", () => {
  it("should list patients for authenticated therapist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will return empty list since we don't have a database in tests
    // In a real scenario, you would mock the database
    const result = await caller.patients.list();

    expect(Array.isArray(result)).toBe(true);
  });

  it("patients.get returns null when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.patients.get({ id: 1 });
    expect(result).toBeNull();
  });

  it("patients.update rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.patients.update({ id: 1, firstName: "Novo" })).rejects.toThrow(
      "Database not available",
    );
  });

  it("patients.delete rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.patients.delete({ id: 1 })).rejects.toThrow(
      "Database not available",
    );
  });

  it("patients.delete is denied for a patient (only the therapist manages the grid)", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    await expect(caller.patients.delete({ id: 1 })).rejects.toThrow(
      "Acesso restrito à psicóloga.",
    );
  });
});

/**
 * Quem inicia o vínculo é a psicóloga: ela cadastra o paciente (nome, sobrenome,
 * e-mail) e o vínculo se completa quando a pessoa cria a conta com aquele
 * e-mail. Não existe auto-cadastro nem escolha de psicóloga pelo paciente.
 */
describe("vínculo paciente ↔ psicóloga", () => {
  it("me.invitation é acessível ao paciente", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    expect(await caller.me.invitation()).toBeNull(); // sem banco nos testes
  });

  it("o paciente não escolhe psicóloga: a rota da lista não existe", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(fonte).not.toContain("availableTherapists");
    // Nem por chamada direta à API: o input não aceita therapistId.
    expect(fonte.slice(
      fonte.indexOf("saveProfile: protectedProcedure"),
      fonte.indexOf("invitation: protectedProcedure"),
    )).not.toContain("therapistId: z.number()");
  });

  /**
   * A ordem importa: procurar o paciente (inclusive casando o convite por
   * e-mail) vem ANTES da recusa. Invertido, ninguém completaria o cadastro —
   * nem quem foi devidamente cadastrado pela psicóloga.
   */
  it("saveProfile procura o convite antes de recusar o auto-cadastro", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const save = fonte.slice(
      fonte.indexOf("saveProfile: protectedProcedure"),
      fonte.indexOf("therapistRequest: protectedProcedure"),
    );
    const posBusca = save.indexOf("pacienteDoUsuario(db, ctx.user)");
    const posRecusa = save.indexOf("precisa ser feito pela sua psicóloga");
    expect(posBusca).toBeGreaterThan(-1);
    expect(posRecusa).toBeGreaterThan(-1);
    expect(posBusca).toBeLessThan(posRecusa);
  });

  it("quem não foi cadastrado pela psicóloga não consegue criar o próprio cadastro", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    await expect(
      caller.me.saveProfile({ firstName: "Ana", lastName: "Souza" }),
    ).rejects.toThrow();
  });

  /**
   * O e-mail é a ÚNICA chave do vínculo. A psicóloga digita à mão e o Supabase
   * guarda o da conta em minúsculas — sem normalizar, "Fulano@Gmail.com" nunca
   * casaria com "fulano@gmail.com" e o paciente veria "peça à sua psicóloga
   * para cadastrar", com o cadastro feito bem na frente dela.
   */
  it("o e-mail é normalizado ao gravar e ao comparar", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    // Grava normalizado (cadastro e edição feitos pela psicóloga).
    const create = fonte.slice(
      fonte.indexOf("create: therapistProcedure"),
      fonte.indexOf("// Busca um paciente pelo id"),
    );
    expect(create).toContain("normalizarEmail(input.email)");
    expect(fonte).toContain("set.email = normalizarEmail(input.email)");
    // E compara normalizado ao procurar o convite.
    const helper = fonte.slice(
      fonte.indexOf("async function pacienteDoUsuario"),
      fonte.indexOf("export const appRouter"),
    );
    expect(helper).toContain("normalizarEmail(user.email)");
  });

  /**
   * A psicóloga cadastra E agenda antes de o paciente entrar. Se o vínculo só
   * fechasse quando ele clicasse em "Salvar cadastro", ele abriria "Minhas
   * Consultas" vazia — com a consulta marcada e ele sem saber.
   */
  it("as consultas e o perfil vinculam o convite sozinhos, sem depender de salvar", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const me = fonte.slice(fonte.indexOf("me: router({"), fonte.indexOf("admin: router({"));
    // As três entradas da área do paciente passam pelo helper que vincula.
    const usos = me.match(/pacienteDoUsuario\(db, ctx\.user\)/g) ?? [];
    expect(usos.length).toBeGreaterThanOrEqual(4); // profile, saveProfile, therapist, appointments
    // E o helper de fato grava o vínculo.
    const helper = fonte.slice(
      fonte.indexOf("async function pacienteDoUsuario"),
      fonte.indexOf("export const appRouter"),
    );
    expect(helper).toContain("set({ userId: user.id })");
  });
});

describe("admin router — aprovação de acesso profissional", () => {
  it("nega a fila de solicitações para um paciente", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    await expect(caller.admin.therapistRequests()).rejects.toThrow();
  });

  // O ponto: quem já foi aprovado não pode aprovar os próximos, senão o
  // primeiro therapist vira porta de entrada para qualquer um.
  it("nega a aprovação para uma psicóloga (therapist) — só o admin aprova", async () => {
    const caller = appRouter.createCaller(createAuthContext(3, "therapist"));
    await expect(
      caller.admin.reviewTherapistRequest({ id: 1, action: "approve" }),
    ).rejects.toThrow();
  });

  it("admin.therapistRequests devolve lista vazia sem banco", async () => {
    const caller = appRouter.createCaller(createAuthContext(1, "admin"));
    const result = await caller.admin.therapistRequests();
    expect(result).toEqual([]);
  });

  it("admin.reviewTherapistRequest falha sem banco", async () => {
    const caller = appRouter.createCaller(createAuthContext(1, "admin"));
    await expect(
      caller.admin.reviewTherapistRequest({ id: 1, action: "approve" }),
    ).rejects.toThrow("Database not available");
  });
});

describe("sessions router", () => {
  it("sessions.getByPatient returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.sessions.getByPatient({ patientId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("therapists router", () => {
  it("therapists.me returns null when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.therapists.me();
    expect(result).toBeNull();
  });

  it("therapists.upsert rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.therapists.upsert({ crp: "06/123456" })).rejects.toThrow(
      "Database not available",
    );
  });
});

describe("appointments router", () => {
  it("appointments.list returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.appointments.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("appointments.updateStatus rejects when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.appointments.updateStatus({ id: 1, status: "completed" }),
    ).rejects.toThrow("Database not available");
  });

  it("appointments.confirm rejects a mismatched roomId", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.appointments.confirm({ id: 1, roomId: "sala-errada" }),
    ).rejects.toThrow("Sala inválida");
  });
});

describe("documents router", () => {
  it("documents.getByPatient returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.documents.getByPatient({ patientId: 1 });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

describe("controle de acesso (RBAC)", () => {
  // Paciente = qualquer papel que não seja admin/therapist.
  const pacienteCaller = () => appRouter.createCaller(createAuthContext(99, "user"));

  it("paciente NÃO acessa a lista de pacientes (prontuários)", async () => {
    await expect(pacienteCaller().patients.list()).rejects.toThrow(/restrito/i);
  });

  it("paciente NÃO acessa sessões nem documentos", async () => {
    await expect(pacienteCaller().sessions.getByPatient({ patientId: 1 })).rejects.toThrow(/restrito/i);
    await expect(pacienteCaller().documents.getByPatient({ patientId: 1 })).rejects.toThrow(/restrito/i);
  });

  it("paciente NÃO pode se auto-promover a terapeuta", async () => {
    await expect(pacienteCaller().therapists.upsert({ crp: "FAKE-1" })).rejects.toThrow(/restrito/i);
  });

  it("paciente NÃO vê agendamentos da clínica", async () => {
    await expect(pacienteCaller().appointments.list()).rejects.toThrow(/restrito/i);
  });

  it("paciente PODE acessar o próprio cadastro (me.profile)", async () => {
    const result = await pacienteCaller().me.profile();
    expect(result).toBeNull(); // sem banco nos testes
  });

  it("admin acessa os prontuários normalmente", async () => {
    const admin = appRouter.createCaller(createAuthContext(1, "admin"));
    const result = await admin.patients.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("solicitação de acesso profissional", () => {
  const caller = () => appRouter.createCaller(createAuthContext(99, "user"));

  it("rejeita CRP em formato inválido", async () => {
    await expect(
      caller().me.requestTherapist({ fullName: "Fulano de Tal", crp: "123456" }),
    ).rejects.toThrow(/CRP inválido/i);
  });

  it("exige nome completo", async () => {
    await expect(
      caller().me.requestTherapist({ fullName: "Ab", crp: "06/123456" }),
    ).rejects.toThrow(/nome completo/i);
  });

  /**
   * O aviso ao admin é o único canal que conta que alguém pediu acesso. Ele é
   * disparado em segundo plano, então PRECISA ser retentável: sem `notifiedAt`,
   * um deploy no meio do envio faz o pedido sumir em silêncio — foi o que
   * aconteceu com a solicitação da Beatriz.
   */
  it("o aviso ao admin é retentável: notifiedAt só é marcado após o envio", () => {
    const fonte = readFileSync(new URL("./notifications.ts", import.meta.url), "utf8");
    const avisar = fonte.slice(
      fonte.indexOf("async function avisarAdmin"),
      fonte.indexOf("export async function notifyAdminOfTherapistRequest"),
    );
    // Sai antes de marcar quando o envio não aconteceu. Casa com o corpo em
    // bloco ou em uma linha: o que importa é existir a saída antecipada, não a
    // formatação — a versão anterior deste teste quebrou só por reformatação.
    expect(avisar).toMatch(/if \(!entregue\)/);
    // O marcador vem DEPOIS do envio, nunca antes. É o coração da retentativa:
    // marcar antes faria um aviso que falhou parecer entregue, para sempre.
    expect(avisar.indexOf("await sendEmail")).toBeLessThan(
      avisar.indexOf("notifiedAt: new Date()"),
    );
    // Falha registra o motivo em vez de sumir no log.
    expect(avisar).toMatch(/registrarErro/);
    // A rede de segurança existe e só pega pendente ainda não avisado.
    expect(fonte).toContain("export async function notifyPendingTherapistRequests");
    expect(fonte).toContain("isNull(therapistRequests.notifiedAt)");
  });

  it("o agendador roda o reenvio das solicitações", () => {
    const idx = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    expect(idx).toContain("notifyPendingTherapistRequests");
  });

  it("solicitar NÃO promove o usuário (segue sem acesso clínico)", async () => {
    // Mesmo após pedir, o papel continua o mesmo — a promoção é manual.
    await expect(caller().patients.list()).rejects.toThrow(/restrito/i);
  });

  // A aprovação concede `therapist`, nunca `admin`: a fila de solicitações é só
  // da dona da clínica. Se um aprovado virasse admin, ele aprovaria os próximos.
  it("aprovar concede therapist, nunca admin", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const trecho = fonte.slice(
      fonte.indexOf("reviewTherapistRequest"),
      fonte.indexOf("therapists: router("),
    );
    expect(trecho).toContain('.set({ role: "therapist" })');
    expect(trecho).not.toContain('role: "admin"');
  });
});

describe("notifications router", () => {
  it("notifications.list returns an empty list when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.notifications.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("notifications.run is a no-op counter when there is no database", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.notifications.run();
    expect(result).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });
});
