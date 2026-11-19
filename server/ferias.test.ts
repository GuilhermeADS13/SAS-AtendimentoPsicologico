/**
 * Férias e folgas (shared/ferias.ts e server/ferias.ts), sem banco. O caminho com banco,
 * inclusive a busca escondendo os horários, está em ferias.integration.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});

import {
  MAX_DIAS_DE_FERIAS,
  consultasNasFerias,
  diaNasFerias,
  diaValido,
  diasNoPeriodo,
  problemaNoPeriodo,
  textoDoPeriodo,
} from "../shared/ferias";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("regras do período", () => {
  const hoje = "2026-11-19";

  it("dia que existe", () => {
    expect(diaValido("2026-12-20")).toBe(true);
    expect(diaValido("2026-02-30")).toBe(false);
    expect(diaValido("20/12/2026")).toBe(false);
  });

  it("conta os dias com o primeiro e o último", () => {
    expect(diasNoPeriodo({ inicio: "2026-12-20", fim: "2026-12-20" })).toBe(1);
    expect(diasNoPeriodo({ inicio: "2026-12-20", fim: "2027-01-05" })).toBe(17);
  });

  it("o que impede de marcar", () => {
    expect(problemaNoPeriodo({ inicio: "2026-12-20", fim: "2027-01-05" }, hoje)).toBeNull();
    // Já começou, mas ainda não acabou: pode (ela esqueceu de marcar ontem).
    expect(problemaNoPeriodo({ inicio: "2026-11-18", fim: "2026-11-25" }, hoje)).toBeNull();
    expect(problemaNoPeriodo({ inicio: "", fim: "2026-12-20" }, hoje)).toBe("Escolha o primeiro e o último dia.");
    expect(problemaNoPeriodo({ inicio: "2026-12-20", fim: "2026-12-10" }, hoje)).toBe("O último dia vem antes do primeiro.");
    expect(problemaNoPeriodo({ inicio: "2026-11-01", fim: "2026-11-10" }, hoje)).toBe("Esse período já passou.");
    expect(problemaNoPeriodo({ inicio: "2026-12-01", fim: "2027-06-01" }, hoje)).toBe(`Marque até ${MAX_DIAS_DE_FERIAS} dias por vez.`);
  });

  it("dia dentro das férias e o texto do período", () => {
    const periodos = [{ inicio: "2026-12-20", fim: "2027-01-05" }];
    expect(diaNasFerias("2026-12-20", periodos)).toBe(true);
    expect(diaNasFerias("2027-01-05", periodos)).toBe(true);
    expect(diaNasFerias("2027-01-06", periodos)).toBe(false);
    expect(textoDoPeriodo(periodos[0])).toBe("20/12/2026 a 05/01/2027");
    expect(textoDoPeriodo({ inicio: "2026-12-25", fim: "2026-12-25" })).toBe("25/12/2026");
  });

  it("consultas marcadas no período, pelo dia de Brasília", () => {
    const consultas = [
      { id: 1, scheduledAt: "2026-12-21T14:00:00-03:00", status: "scheduled" },
      { id: 2, scheduledAt: "2026-12-20T09:00:00-03:00", status: "scheduled" },
      { id: 3, scheduledAt: "2026-12-22T09:00:00-03:00", status: "cancelled" },
      // 22h do dia 19 em Brasília (dia 20 em UTC): fora das férias.
      { id: 4, scheduledAt: "2026-12-20T01:00:00Z", status: "scheduled" },
      { id: 5, scheduledAt: "2027-01-06T09:00:00-03:00", status: "scheduled" },
    ];
    expect(consultasNasFerias(consultas, { inicio: "2026-12-20", fim: "2027-01-05" }).map((c) => c.id)).toEqual([2, 1]);
  });
});

describe("rotas das férias, sem banco", () => {
  const psicologa = {
    user: {
      id: 1, openId: "sb:ferias", email: "ferias@exemplo.com", name: "Psi", loginMethod: "supabase",
      role: "therapist", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
  const caller = appRouter.createCaller(psicologa);

  it("período errado é recusado antes do banco", async () => {
    await expect(caller.ferias.criar({ inicio: "2020-01-01", fim: "2020-01-10" })).rejects.toThrow(/já passou/);
    await expect(caller.ferias.criar({ inicio: "2026-12-20", fim: "2026-12-01" })).rejects.toThrow(/antes do primeiro/);
  });

  it("sem banco, a lista vem vazia e as gravações avisam", async () => {
    expect(await caller.ferias.listar()).toEqual([]);
    await expect(caller.ferias.criar({ inicio: "2099-12-20", fim: "2099-12-30" })).rejects.toThrow(/Database not available/);
    await expect(caller.ferias.remover({ id: 1 })).rejects.toThrow(/Database not available/);
  });
});
