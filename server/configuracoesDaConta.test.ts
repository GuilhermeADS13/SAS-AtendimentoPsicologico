import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { nomeDoNavegador } from "../shared/navegador";
import { avisoLigado, avisosComPadrao, TIPOS_DE_AVISO } from "../shared/avisosPorEmail";

describe("nome do aparelho na lista", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "Chrome no Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0", "Opera no Windows"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", "Edge no Windows"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", "Safari no iPhone"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1", "Chrome no iPhone"],
    ["Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36", "Samsung Internet no Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", "Safari no Mac"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox no Linux"],
    ["", "Navegador"],
  ])("%s", (ua, esperado) => {
    expect(nomeDoNavegador(ua)).toBe(esperado);
  });

  it("qualquer User-Agent vira um nome curto, sem lançar erro", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (ua) => {
        const nome = nomeDoNavegador(ua);
        expect(nome.length).toBeLessThanOrEqual(80);
        expect(nome).toMatch(/^[A-Za-z ]+$/);
      }),
    );
  });
});

describe("avisos por e-mail", () => {
  it("sem nada salvo, todos ligados (o padrão de sempre)", () => {
    expect(avisosComPadrao(null)).toEqual({ lembrete: true, consultaNova: true, cancelamento: true });
    expect(avisosComPadrao(undefined)).toEqual(avisosComPadrao({}));
  });

  it("só false desliga; lixo no banco não desliga nada", () => {
    expect(avisosComPadrao({ lembrete: false })).toEqual({ lembrete: false, consultaNova: true, cancelamento: true });
    expect(avisosComPadrao({ lembrete: "false", consultaNova: 0, cancelamento: null })).toEqual({
      lembrete: true, consultaNova: true, cancelamento: true,
    });
    expect(avisosComPadrao("texto")).toEqual(avisosComPadrao(null));
    expect(avisoLigado({ cancelamento: false }, "cancelamento")).toBe(false);
  });

  it("guarda só os tipos conhecidos (campo a mais no pedido não vai para o banco)", () => {
    expect(Object.keys(avisosComPadrao({ lembrete: true, extra: false })).sort()).toEqual(TIPOS_DE_AVISO.map((t) => t.id).sort());
  });
});
