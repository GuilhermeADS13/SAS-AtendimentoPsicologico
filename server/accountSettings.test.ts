import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function criarContexto(
  role: AuthenticatedUser["role"] | null = "therapist",
  email = "pessoa@example.com",
): TrpcContext {
  const user: AuthenticatedUser | null = role
    ? {
        id: 1,
        openId: "test-user",
        email,
        name: "Test User",
        loginMethod: "supabase",
        role,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }
    : null;

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/**
 * Aba de Configurações. Sem banco nos testes, o que dá para garantir é o
 * contrato: quem pode chamar, o que volta quando o banco não responde e o
 * limite de tamanho do telefone — que precisa bater com a coluna varchar(20),
 * senão o erro só aparece em produção, no INSERT.
 */
describe("configurações da conta", () => {
  it("exige login para ver o contato", async () => {
    const caller = appRouter.createCaller(criarContexto(null));
    await expect(caller.me.contato()).rejects.toThrow();
  });

  it("exige login para trocar o telefone", async () => {
    const caller = appRouter.createCaller(criarContexto(null));
    await expect(caller.me.updatePhone({ phone: "11999999999" })).rejects.toThrow();
  });

  it("sem banco, ainda devolve o e-mail da sessão (não quebra a tela)", async () => {
    const caller = appRouter.createCaller(criarContexto("therapist", "psi@example.com"));
    const resultado = await caller.me.contato();
    expect(resultado.email).toBe("psi@example.com");
    expect(resultado.phone).toBe("");
  });

  it("recusa telefone maior que a coluna do banco (20)", async () => {
    const caller = appRouter.createCaller(criarContexto("patient"));
    await expect(caller.me.updatePhone({ phone: "1".repeat(21) })).rejects.toThrow();
  });

  it("aceita telefone no limite de 20 caracteres", async () => {
    const caller = appRouter.createCaller(criarContexto("patient"));
    // Passa da validação e só falha por não haver banco no teste — é o que
    // separa "recusado pelo zod" de "aceito pelo contrato".
    await expect(caller.me.updatePhone({ phone: "1".repeat(20) })).rejects.toThrow(
      /Database not available/,
    );
  });
});
