/**
 * Indique uma colega (shared/indicacao.ts e server/indicacao.ts), sem banco. A contagem
 * e a lista do suporte, contra o Postgres, estão em indicacao.integration.test.ts.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});

import { ORIGEM_REGEX } from "../shared/entradaNoSite";
import { linkDeIndicacao, mensagemDeIndicacao, origemDeIndicacao, quemIndicou } from "../shared/indicacao";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("código e link da indicação", () => {
  it("o código é o id da conta em base 36 e volta para o id", () => {
    expect(origemDeIndicacao(12345)).toBe("ind-9ix");
    expect(quemIndicou("ind-9ix")).toBe(12345);
  });

  it("cabe na regra das origens do cadastro, mesmo com id grande", () => {
    expect(ORIGEM_REGEX.test(origemDeIndicacao(1))).toBe(true);
    expect(ORIGEM_REGEX.test(origemDeIndicacao(2 ** 31))).toBe(true);
  });

  it("outras origens não são indicação", () => {
    for (const origem of ["instagram", "indicacao-cibelle", "ind-", "ind-ABC", "ind-0", "ind-a-b", null, undefined]) {
      expect(quemIndicou(origem), String(origem)).toBeNull();
    }
  });

  it("link do cadastro de psicóloga com a origem, e a mensagem com o link", () => {
    const link = linkDeIndicacao("https://vozinterior.app.br/", "ind-9ix");
    expect(link).toBe("https://vozinterior.app.br/login?criar=psicologa&origem=ind-9ix");
    const mensagem = mensagemDeIndicacao(link);
    expect(mensagem).toContain(link);
    expect(mensagem).toContain("1 mês grátis");
  });
});

describe("rotas da indicação, sem banco", () => {
  const conta = (role: "therapist" | "admin" | "user"): TrpcContext =>
    ({
      user: {
        id: 12345, openId: "sb:indica", email: "indica@exemplo.com", name: "Psi", loginMethod: "supabase",
        role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      aparelhoVerificado: true,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    }) as TrpcContext;

  it("a psicóloga recebe o código dela; sem banco, sem contagem", async () => {
    expect(await appRouter.createCaller(conta("therapist")).indicacao.minha()).toEqual({ origem: "ind-9ix", contagem: null });
  });

  it("a lista é só do suporte; sem banco, vem null", async () => {
    expect(await appRouter.createCaller(conta("admin")).admin.indicacoes()).toBeNull();
    await expect(appRouter.createCaller(conta("therapist")).admin.indicacoes()).rejects.toThrow();
    await expect(appRouter.createCaller(conta("user")).indicacao.minha()).rejects.toThrow();
  });
});
