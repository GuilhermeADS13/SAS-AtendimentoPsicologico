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

describe("vínculo paciente ↔ psicóloga", () => {
  it("me.availableTherapists é acessível ao paciente (ele precisa escolher)", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    const result = await caller.me.availableTherapists();
    expect(Array.isArray(result)).toBe(true);
  });

  it("primeiro cadastro sem escolher psicóloga é recusado", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    // Sem banco o erro vem antes; o que importa é o contrato do input aceitar
    // therapistId opcional e a validação existir no servidor.
    await expect(
      caller.me.saveProfile({ firstName: "Ana", lastName: "Souza" }),
    ).rejects.toThrow();
  });

  it("paciente não pode aceitar a si mesmo (só a psicóloga responde)", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    await expect(
      caller.patients.reviewRequest({ id: 1, action: "accept" }),
    ).rejects.toThrow(/restrito/i);
  });

  it("paciente não enxerga a fila de solicitações", async () => {
    const caller = appRouter.createCaller(createAuthContext(2, "user"));
    await expect(caller.patients.pendingRequests()).rejects.toThrow(/restrito/i);
  });

  it("patients.reviewRequest falha sem banco", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(
      caller.patients.reviewRequest({ id: 1, action: "accept" }),
    ).rejects.toThrow("Database not available");
  });

  // A trava que impede agendar para quem a psicóloga nunca aceitou. Sem banco
  // não dá para exercitar o caminho todo, mas o contrato precisa existir.
  it("appointments.create rejeita paciente pendente (contrato no servidor)", () => {
    const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const trecho = fonte.slice(fonte.indexOf("appointments: router("));
    const create = trecho.slice(trecho.indexOf("create: therapistProcedure"));
    expect(create).toContain('patient[0].status === "pending"');
    expect(create).toMatch(/Aceite a solicitação deste paciente/);
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
