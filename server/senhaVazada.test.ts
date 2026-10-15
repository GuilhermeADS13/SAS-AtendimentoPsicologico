import { afterEach, describe, expect, it, vi } from "vitest";
import { faixaDoHibp, sha1Hex, senhaVazada, sufixoNaFaixa } from "../shared/senhaVazada";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/** Senha vazada (Have I Been Pwned), por k-anonimato: a senha nunca sai de onde foi digitada. */
describe("senha vazada (HIBP)", () => {
  afterEach(() => vi.unstubAllGlobals());

  // SHA-1 de "password", o exemplo clássico da documentação do HIBP.
  const HASH = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
  const faixa = `0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n${HASH.slice(5)}:52372427\r\nFFFFF00000000000000000000000000000:0`;

  it("calcula o SHA-1 no formato do HIBP", async () => {
    expect(await sha1Hex("password")).toBe(HASH);
  });

  it("acha o resto do hash na faixa; linha de enchimento (0) não conta", () => {
    expect(sufixoNaFaixa(faixa, HASH.slice(5))).toBe(true);
    expect(sufixoNaFaixa(faixa, "FFFFF00000000000000000000000000000")).toBe(false);
    expect(sufixoNaFaixa(faixa, "1234567890ABCDEF1234567890ABCDEF123")).toBe(false);
  });

  it("só os 5 PRIMEIROS caracteres do hash saem — nunca a senha nem o hash inteiro", async () => {
    const fetch = vi.fn(async () => new Response(faixa));
    expect(await senhaVazada("password", fetch as unknown as typeof globalThis.fetch)).toBe(true);
    const url = String((fetch.mock.calls[0] as unknown[])[0]);
    expect(url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    // (o domínio contém "passwords"; o que importa é o caminho só ter o prefixo)
    expect(new URL(url).pathname).toBe("/range/5BAA6");
  });

  it("HIBP fora do ar não bloqueia ninguém", async () => {
    const falha = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await senhaVazada("password", falha as unknown as typeof globalThis.fetch)).toBe(false);
  });

  it("a rota só aceita prefixo de hash (não vira proxy para outra coisa)", async () => {
    const fetch = vi.fn();
    expect(await faixaDoHibp("../x", fetch as unknown as typeof globalThis.fetch)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("o cadastro recusa senha vazada, mesmo forte pelas regras", async () => {
    const forte = "Senha@Forte1";
    const hash = await sha1Hex(forte);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`${hash.slice(5)}:12`)));
    const caller = appRouter.createCaller({
      user: null,
      req: { get: () => undefined, headers: {}, socket: { remoteAddress: "127.0.0.2" } } as unknown as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(
      caller.auth.signUp({ email: "vazada@exemplo.com", senha: forte, nome: "Ana Souza", celular: "81999990000", aceitouPolitica: true }),
    ).rejects.toThrow(/vazamentos/);
  });
});
