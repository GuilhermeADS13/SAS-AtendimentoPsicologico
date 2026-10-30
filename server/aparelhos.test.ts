import { describe, expect, it } from "vitest";
import { lerCookie, mascararEmail, precisaVerificarAparelho } from "./aparelhos";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const producao = { NODE_ENV: "production" } as NodeJS.ProcessEnv;

describe("quem passa pela verificação de aparelho", () => {
  it("psicóloga e admin passam; paciente não", () => {
    expect(precisaVerificarAparelho("therapist", producao)).toBe(true);
    expect(precisaVerificarAparelho("admin", producao)).toBe(true);
    expect(precisaVerificarAparelho("patient", producao)).toBe(false);
    expect(precisaVerificarAparelho("user", producao)).toBe(false);
  });

  it("o plano B desliga para todo mundo, se o envio de e-mail cair", () => {
    expect(precisaVerificarAparelho("admin", { ...producao, VERIFICACAO_DE_APARELHO: "desligada" })).toBe(false);
  });

  it("qualquer outro valor na variável não desliga a proteção", () => {
    expect(precisaVerificarAparelho("admin", { ...producao, VERIFICACAO_DE_APARELHO: "false" })).toBe(true);
  });
});

describe("cookie e e-mail", () => {
  it("acha o cookie certo no meio dos outros", () => {
    expect(lerCookie("a=1; sas_aparelho=abc; b=2", "sas_aparelho")).toBe("abc");
  });

  it("não confunde nome parecido e aguenta cabeçalho vazio", () => {
    expect(lerCookie("xsas_aparelho=abc", "sas_aparelho")).toBeNull();
    expect(lerCookie(undefined, "sas_aparelho")).toBeNull();
  });

  it("mostra o destino sem expor o endereço inteiro", () => {
    expect(mascararEmail("ana.souza@gmail.com")).toBe("an***@gmail.com");
  });
});

describe("bloqueio na API", () => {
  const caller = (role: "therapist" | "admin", aparelhoVerificado: boolean) =>
    appRouter.createCaller({
      user: { id: 1, role, email: "a@exemplo.test", name: "A" } as TrpcContext["user"],
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
      aparelhoVerificado,
    });

  it("aparelho sem confirmar não lê prontuário, mensagens nem o painel do admin", async () => {
    const c = caller("admin", false);
    await expect(c.patients.list()).rejects.toThrow("Confirme este aparelho");
    await expect(c.chat.unreadCount()).rejects.toThrow("Confirme este aparelho");
    await expect(c.admin.therapistRequests()).rejects.toThrow("Confirme este aparelho");
  });

  it("a tela sabe que falta confirmar, sem precisar do erro", async () => {
    expect(await caller("therapist", false).auth.me()).toMatchObject({ aparelhoVerificado: false });
  });

  it("aparelho confirmado passa", async () => {
    await expect(caller("therapist", true).patients.list()).resolves.toBeDefined();
  });

  it("código com letra ou tamanho errado nem chega ao banco", async () => {
    await expect(caller("therapist", false).aparelho.confirmarCodigo({ codigo: "12a456" })).rejects.toThrow();
    await expect(caller("therapist", false).aparelho.confirmarCodigo({ codigo: "123" })).rejects.toThrow();
  });
});
