import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarTelegram } from "./telegram";

describe("aviso pelo Telegram", () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    fetchFalso.mockReset();
    vi.stubGlobal("fetch", fetchFalso);
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "token-de-teste");
    vi.stubEnv("TELEGRAM_CHAT_ID", "123");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sem configuração não chama ninguém", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    await expect(enviarTelegram("oi")).resolves.toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("manda o texto para o chat configurado", async () => {
    fetchFalso.mockResolvedValue({ ok: true });
    await expect(enviarTelegram("Nova solicitação")).resolves.toBe(true);
    const [endereco, opcoes] = fetchFalso.mock.calls[0];
    expect(endereco).toBe("https://api.telegram.org/bottoken-de-teste/sendMessage");
    expect(JSON.parse(opcoes.body)).toEqual({ chat_id: "123", text: "Nova solicitação" });
  });

  it("falha sem expor o token na mensagem de erro", async () => {
    fetchFalso.mockResolvedValue({ ok: false, status: 401 });
    const erro = await enviarTelegram("oi").catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain("401");
    expect((erro as Error).message).not.toContain("token-de-teste");
  });
});
