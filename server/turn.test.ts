import { afterEach, describe, expect, it, vi } from "vitest";
import { iceServersParaChamada, limparCacheTurn } from "./turn";

/**
 * O que importa aqui é o caminho de FALHA: a videochamada nunca pode cair porque
 * o TURN não respondeu. Sem configuração, ou com a API fora do ar, a chamada
 * precisa seguir com STUN — que atende a maioria das redes.
 */
afterEach(() => {
  limparCacheTurn();
  vi.unstubAllGlobals();
});

const soStun = (servers: { urls: string | string[] }[]) =>
  servers.every(s => JSON.stringify(s.urls).includes("stun:"));

describe("servidores ICE da videochamada", () => {
  it("sem configuração, devolve só STUN (não quebra a chamada)", async () => {
    const servers = await iceServersParaChamada({} as NodeJS.ProcessEnv);
    expect(servers.length).toBeGreaterThan(0);
    expect(soStun(servers)).toBe(true);
  });

  it("busca credenciais temporárias na Metered e as inclui", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { urls: "turn:teste.metered.live:80", username: "abc", credential: "xyz" },
      ],
    });
    vi.stubGlobal("fetch", fetchFalso);

    const servers = await iceServersParaChamada({
      METERED_DOMAIN: "exemplo.metered.live",
      METERED_API_KEY: "chave-de-teste",
    } as NodeJS.ProcessEnv);

    const url = fetchFalso.mock.calls[0][0] as string;
    expect(url).toBe("https://exemplo.metered.live/api/v1/turn/credentials?apiKey=chave-de-teste");
    expect(servers.some(s => JSON.stringify(s.urls).includes("turn:"))).toBe(true);
    // O STUN continua na lista: se o TURN falhar em tempo real, ainda há caminho.
    expect(servers.some(s => JSON.stringify(s.urls).includes("stun:"))).toBe(true);
  });

  it("se a Metered falhar, segue com STUN em vez de estourar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const servers = await iceServersParaChamada({
      METERED_DOMAIN: "exemplo.metered.live",
      METERED_API_KEY: "chave-invalida",
    } as NodeJS.ProcessEnv);
    expect(soStun(servers)).toBe(true);
  });

  it("ignora espaço/CRLF em volta do valor (env colado no painel)", async () => {
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ urls: "turn:teste.metered.live:80" }],
    });
    vi.stubGlobal("fetch", fetchFalso);
    await iceServersParaChamada({
      METERED_DOMAIN: "  exemplo.metered.live\r",
      METERED_API_KEY: " chave \n",
    } as NodeJS.ProcessEnv);
    expect(fetchFalso.mock.calls[0][0]).toBe(
      "https://exemplo.metered.live/api/v1/turn/credentials?apiKey=chave",
    );
  });
});
