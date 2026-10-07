import { describe, expect, it } from "vitest";
import { resolveAiAccessContext } from "./ai/clinical-tools";

/**
 * Banco falso só para `select().from().where().limit()`: devolve as linhas dadas.
 * resolveAiAccessContext só faz essa consulta (perfil de psicóloga ou paciente).
 */
function bancoCom(linhas: { id: number }[]) {
  const consulta = {
    from: () => consulta,
    where: () => consulta,
    limit: async () => linhas,
  };
  return { select: () => consulta } as unknown as Parameters<typeof resolveAiAccessContext>[0];
}

describe("resolveAiAccessContext — admin na Luma clínica", () => {
  it("admin com perfil de psicóloga vira psicóloga, com o PRÓPRIO therapistId", async () => {
    const ctx = await resolveAiAccessContext(bancoCom([{ id: 2 }]), { id: 12, role: "admin" });
    expect(ctx).toEqual({ userId: 12, role: "therapist", therapistId: 2 });
  });

  it("admin sem perfil de psicóloga continua sem acesso clínico", async () => {
    const ctx = await resolveAiAccessContext(bancoCom([]), { id: 12, role: "admin" });
    expect(ctx).toEqual({ userId: 12, role: "admin" });
  });

  it("psicóloga continua no próprio escopo", async () => {
    const ctx = await resolveAiAccessContext(bancoCom([{ id: 4 }]), { id: 30, role: "therapist" });
    expect(ctx).toEqual({ userId: 30, role: "therapist", therapistId: 4 });
  });
});
