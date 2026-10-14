import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { registrarPedidoDoCadastro } from "./pedidoProfissional";
import type { TrpcContext } from "./_core/context";

/**
 * Cadastro pelo nosso servidor, com confirmação de e-mail. Antes ia direto ao
 * Supabase com "Confirm email" desligado: qualquer um criava conta com o e-mail
 * de um paciente já cadastrado e virava ele.
 */
const publico = () =>
  appRouter.createCaller({
    user: null,
    req: { get: () => undefined, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  });

const valido = { email: "nova@exemplo.com", senha: "Senha@Forte1", nome: "Ana Souza", aceitouPolitica: true as const };

describe("cadastro com confirmação de e-mail", () => {
  it("a política de senha vale NO SERVIDOR (antes era só o formulário)", async () => {
    await expect(publico().auth.signUp({ ...valido, senha: "123" })).rejects.toThrow();
    await expect(publico().auth.signUp({ ...valido, senha: "senhafraca" })).rejects.toThrow(/mai[uú]scula|n[uú]mero|s[ií]mbolo/i);
  });

  it("sem aceitar a política de privacidade (LGPD), não cria", async () => {
    await expect(
      publico().auth.signUp({ ...valido, aceitouPolitica: false as unknown as true }),
    ).rejects.toThrow();
  });

  it("CRP fora do formato é recusado", async () => {
    await expect(publico().auth.signUp({ ...valido, crp: "abc" })).rejects.toThrow();
  });

  it("pedido de CRP do cadastro: nada para quem já é psicóloga nem com CRP inválido", async () => {
    const usuario = { id: 1, role: "therapist", name: "X", email: "x@exemplo.com" } as never;
    await expect(registrarPedidoDoCadastro(usuario, "06/123456")).resolves.toBeUndefined();
    const paciente = { id: 2, role: "user", name: "Y", email: "y@exemplo.com" } as never;
    await expect(registrarPedidoDoCadastro(paciente, "não é crp")).resolves.toBeUndefined();
  });
});
