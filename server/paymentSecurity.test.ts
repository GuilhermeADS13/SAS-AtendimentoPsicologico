import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const start = source.indexOf("setPayment: therapistProcedure");
const end = source.indexOf("}),\n  }),\n\n  sessions:", start);
const mutationSource = source.slice(start, end > start ? end : undefined);

describe("segurança da mutation de pagamento", () => {
  it("resolve o terapeuta a partir do usuário autenticado", () => {
    expect(mutationSource).toContain("eq(therapists.userId, ctx.user.id)");
    expect(mutationSource).toContain("if (!therapist.length) throw new Error(\"Therapist not found\")");
  });

  it("atualiza somente consultas pertencentes ao terapeuta resolvido", () => {
    expect(mutationSource).toContain("eq(appointments.therapistId, therapist[0].id)");
    expect(mutationSource).toContain("and(eq(appointments.id, input.id), eq(appointments.therapistId, therapist[0].id))");
  });

  it("registra o usuário autenticado como auditor do pagamento", () => {
    expect(mutationSource).toContain("set.paymentUpdatedBy = ctx.user.id");
    expect(mutationSource).toContain("paymentUpdatedBy: appointments.paymentUpdatedBy");
  });
});
