/**
 * auth.me vai para o navegador: só o que a tela usa. A linha inteira de `users`
 * levava o hash do código de troca de e-mail (sha256 de 6 dígitos), e com ele
 * dava para confirmar a troca para um e-mail alheio sem acesso à caixa.
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.me", () => {
  it("não devolve o pedido de troca de e-mail nem outros campos internos da conta", async () => {
    const agora = new Date();
    const user = {
      id: 7, openId: "sb:uid-secreto", name: "Ana", email: "ana@exemplo.test", loginMethod: "email", role: "therapist",
      createdAt: agora, updatedAt: agora, lastSignedIn: agora, onboardingSeenAt: null,
      emailChangeNew: "outra@exemplo.test", emailChangeCodeHash: "a".repeat(64), emailChangeExpires: agora, emailChangeAttempts: 2,
      avisosPorEmail: null,
    } as unknown as TrpcContext["user"];
    const me = await appRouter
      .createCaller({ user, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], aparelhoVerificado: true })
      .auth.me();
    expect(Object.keys(me ?? {}).sort()).toEqual(
      ["aparelhoVerificado", "cadastroPendente", "createdAt", "email", "id", "lastSignedIn", "loginMethod", "name", "role"].sort(),
    );
    expect(JSON.stringify(me)).not.toMatch(/aaaa|outra@|uid-secreto/);
  });
});
