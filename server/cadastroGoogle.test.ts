/**
 * Entrar com o Google: conta nova sem o aceite dos Termos e sem celular fica com o
 * cadastro pendente, e a API só libera completar o cadastro (LGPD: dado de saúde
 * exige consentimento explícito, como no cadastro por e-mail).
 */
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "";
});
const contaDuble = vi.hoisted(() => ({ gravados: [] as Array<{ uid: string; dados: Record<string, string> }> }));
vi.mock("./supabaseAdmin", async (importOriginal) => {
  const original = await importOriginal<typeof import("./supabaseAdmin")>();
  return {
    ...original,
    completarCadastroNaConta: vi.fn(async (uid: string, dados: Record<string, string>) => {
      contaDuble.gravados.push({ uid, dados });
    }),
  };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { cadastroPendente } from "../shared/cadastroPendente";
import { CADASTRO_PENDENTE_ERR_MSG } from "../shared/const";

function ctx(cadastroPendenteAgora: boolean): TrpcContext {
  return {
    user: {
      id: 77, openId: "sb:uid-do-google", email: "ana@gmail.com", name: "Ana Google", loginMethod: "supabase",
      role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    aparelhoVerificado: true,
    cadastroPendente: cadastroPendenteAgora,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1", socket: {} } as unknown as TrpcContext["req"],
    res: { clearCookie: () => {}, cookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("quando o cadastro está pendente", () => {
  it("só conta do Google (ou outro provedor) sem o aceite fica pendente", () => {
    expect(cadastroPendente({ provedores: ["google"] })).toBe(true);
    expect(cadastroPendente({ provedores: ["google"], aceitouPoliticaEm: "2026-11-04T12:00:00Z" })).toBe(false);
    // Já tinha login por e-mail (passou pelo formulário) e ligou o Google depois.
    expect(cadastroPendente({ provedores: ["email", "google"] })).toBe(false);
    expect(cadastroPendente({ provedores: ["email"] })).toBe(false);
    // Token sem a informação: não barra (contas antigas, testes).
    expect(cadastroPendente({ provedores: [] })).toBe(false);
  });
});

describe("API com o cadastro pendente", () => {
  it("barra as rotas da conta com o aviso de completar o cadastro", async () => {
    const caller = appRouter.createCaller(ctx(true));
    await expect(caller.me.profile()).rejects.toThrow(CADASTRO_PENDENTE_ERR_MSG);
    await expect(caller.me.appointments()).rejects.toThrow(CADASTRO_PENDENTE_ERR_MSG);
    await expect(caller.chat.unreadCount()).rejects.toThrow(CADASTRO_PENDENTE_ERR_MSG);
  });

  it("auth.me avisa a tela que falta completar", async () => {
    expect(await appRouter.createCaller(ctx(true)).auth.me()).toMatchObject({ cadastroPendente: true });
    expect(await appRouter.createCaller(ctx(false)).auth.me()).toMatchObject({ cadastroPendente: false });
  });

  it("completar exige o aceite e um celular válido", async () => {
    const caller = appRouter.createCaller(ctx(true));
    await expect(caller.auth.completarCadastro({ celular: "81999990000", aceitouPolitica: false as unknown as true })).rejects.toThrow();
    await expect(caller.auth.completarCadastro({ celular: "123", aceitouPolitica: true })).rejects.toThrow(/celular com DDD/);
    await expect(caller.auth.completarCadastro({ celular: "81999990000", crp: "abc", aceitouPolitica: true })).rejects.toThrow();
    expect(contaDuble.gravados).toEqual([]);
  });

  it("completar grava na conta o aceite, o celular, o CRP e a origem", async () => {
    contaDuble.gravados.length = 0;
    await appRouter
      .createCaller(ctx(true))
      .auth.completarCadastro({ celular: "(81) 99999-0000", crp: "06/123456", origem: "instagram", aceitouPolitica: true });
    expect(contaDuble.gravados).toHaveLength(1);
    const { uid, dados } = contaDuble.gravados[0];
    expect(uid).toBe("uid-do-google");
    expect(dados).toMatchObject({ telefone: "81999990000", crp_solicitado: "06/123456", origem: "instagram" });
    expect(Number.isNaN(Date.parse(dados.aceite_politica_em))).toBe(false);
  });

  it("quem já completou não regrava (nem pede CRP por esta rota)", async () => {
    contaDuble.gravados.length = 0;
    await expect(
      appRouter.createCaller(ctx(false)).auth.completarCadastro({ celular: "81999990000", crp: "06/123456", aceitouPolitica: true }),
    ).rejects.toThrow(/já está completo/);
    expect(contaDuble.gravados).toEqual([]);
  });
});
