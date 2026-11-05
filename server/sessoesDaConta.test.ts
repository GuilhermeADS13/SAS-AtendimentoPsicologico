/**
 * Aparelhos conectados do paciente = sessões abertas no Supabase Auth. Aqui: qual
 * é "este aparelho" (session_id do token da chamada) e o nome mostrado na lista.
 */
import { describe, expect, it } from "vitest";
import { montarSessoes, sessaoDoToken } from "./sessoesDaConta";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const bearer = (payload: unknown) => `Bearer ${b64({ alg: "ES256" })}.${b64(payload)}.assinatura`;

describe("sessaoDoToken", () => {
  it("lê o session_id do token da chamada", () => {
    expect(sessaoDoToken(bearer({ sub: "u", session_id: "s-1" }))).toBe("s-1");
  });

  it("sem cabeçalho, sem Bearer, sem session_id ou com lixo: null", () => {
    for (const h of [undefined, "", "Basic abc", bearer({ sub: "u" }), bearer({ session_id: 7 }), "Bearer x.%%%.y", "Bearer semPontos"]) {
      expect(sessaoDoToken(h)).toBeNull();
    }
  });
});

describe("montarSessoes", () => {
  it("dá nome ao navegador e marca este aparelho", () => {
    const opera = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 OPR/115.0";
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const lista = montarSessoes(
      [
        { id: "a", user_agent: opera, created_at: "2026-11-05T18:15:37Z", ultimo: "2026-11-05T19:00:00Z" },
        { id: "b", user_agent: iphone, created_at: new Date("2026-11-01T10:00:00Z"), ultimo: new Date("2026-11-02T10:00:00Z") },
        { id: "c", user_agent: null, created_at: "2026-10-01T10:00:00Z", ultimo: "2026-10-01T10:00:00Z" },
      ],
      "a",
    );
    expect(lista.map((s) => [s.navegador, s.estaSessao])).toEqual([
      ["Opera no Windows", true],
      ["Safari no iPhone", false],
      ["Navegador", false],
    ]);
    expect(lista[0].ultimoUso.toISOString()).toBe("2026-11-05T19:00:00.000Z");
  });
});
