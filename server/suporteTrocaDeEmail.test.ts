/**
 * Troca de e-mail (dois códigos) e a troca feita pelo suporte, sem banco. O fluxo completo,
 * contra o Postgres, está em trocaDeEmail.integration.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});

import { appRouter, hashDaTrocaDeEmail } from "./routers";
import { encerrarTodasAsSessoes } from "./sessoesDaConta";
import type { TrpcContext } from "./_core/context";

function conta(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 1, openId: "sb:uid-do-admin", email: "admin@exemplo.com", name: "Admin", loginMethod: "supabase",
      role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  } as TrpcContext;
}

describe("troca de e-mail com dois códigos", () => {
  it("só o par certo, na ordem certa, confere", () => {
    const certo = hashDaTrocaDeEmail("123456", "654321");
    expect(hashDaTrocaDeEmail(" 123456", "654321 ")).toBe(certo);
    expect(hashDaTrocaDeEmail("654321", "123456")).not.toBe(certo);
    // Só o código do e-mail novo (quem roubou a sessão) não confere.
    expect(hashDaTrocaDeEmail("", "654321")).not.toBe(certo);
    expect(hashDaTrocaDeEmail("654321", "654321")).not.toBe(certo);
  });
});

describe("troca de e-mail pelo suporte", () => {
  it("é só do admin", async () => {
    const paciente = appRouter.createCaller(conta("user"));
    await expect(paciente.admin.contaPorEmail({ email: "alguem@exemplo.com" })).rejects.toThrow();
    await expect(paciente.admin.trocarEmailDaConta({ userId: 2, novoEmail: "novo@exemplo.com" })).rejects.toThrow();
  });

  it("sem banco, a busca não acha ninguém e a troca não acontece", async () => {
    const admin = appRouter.createCaller(conta("admin"));
    expect(await admin.admin.contaPorEmail({ email: "alguem@exemplo.com" })).toBeNull();
    await expect(admin.admin.trocarEmailDaConta({ userId: 2, novoEmail: "novo@exemplo.com" })).rejects.toThrow(/Database not available/);
  });

  it("encerrar as sessões é melhor esforço: sem banco, devolve null e não lança", async () => {
    await expect(encerrarTodasAsSessoes("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });
});
