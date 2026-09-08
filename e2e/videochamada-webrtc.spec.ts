import { test, expect } from "@playwright/test";

/**
 * Segurança da sinalização da videochamada (/api/ws/rtc) e da presença
 * (/api/ws/presence).
 *
 * Antes, abrir esses WebSockets não exigia nada: quem soubesse o nome da sala
 * entrava e ainda escolhia o próprio papel. Agora a conexão precisa autenticar —
 * a primeira mensagem tem que ser `{ type: "auth", token }` com um token válido
 * do Supabase, e o servidor confere no banco que a pessoa é a psicóloga ou o
 * paciente daquela consulta. Sem isso, o servidor fecha a conexão.
 *
 * Este teste garante as duas coisas ao mesmo tempo:
 *  - o upgrade do WebSocket FUNCIONA (o `onopen` dispara). Se voltasse o bug dos
 *    dois WebSocketServer no mesmo HTTP — em que o primeiro abortava (400) o
 *    upgrade do outro —, o `onopen` nunca viria e o teste falharia.
 *  - sem autenticação (ou com token inválido), o servidor FECHA a conexão, em vez
 *    de deixá-la entrar na sala.
 *
 * Não usa câmera nem duas contas: valida a barreira de acesso, que é o ponto de
 * segurança. A negociação de mídia ponta a ponta depende de duas contas reais e
 * de uma consulta agendada entre elas — fora do escopo deste teste.
 */

const TEMPO_LIMITE = 9000;

/** Abre o WS, opcionalmente manda uma mensagem de auth, e relata o que acontece. */
async function sondar(
  page: import("@playwright/test").Page,
  caminho: string,
  authMsg: unknown | null,
) {
  return page.evaluate(
    async ([caminho, authMsg, limite]) => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}${caminho}?room=sonda-${Date.now()}`);
      return await new Promise<{ abriu: boolean; fechou: boolean; code: number | null }>((resolve) => {
        let abriu = false;
        const fim = setTimeout(() => resolve({ abriu, fechou: false, code: null }), Number(limite));
        ws.onopen = () => {
          abriu = true;
          if (authMsg) ws.send(JSON.stringify(authMsg));
        };
        ws.onclose = (e) => {
          clearTimeout(fim);
          resolve({ abriu, fechou: true, code: e.code });
        };
        ws.onerror = () => {};
      });
    },
    [caminho, authMsg, String(TEMPO_LIMITE)] as const,
  );
}

test.describe("segurança da videochamada", () => {
  test("a sinalização recusa conexão sem autenticação", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    const r = await sondar(page, "/api/ws/rtc", null);
    expect(r.abriu).toBe(true); // o upgrade funcionou (não voltou o bug dos 2 WS)
    expect(r.fechou).toBe(true); // o servidor fechou por falta de auth
  });

  test("a sinalização recusa token inválido", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    const r = await sondar(page, "/api/ws/rtc", { type: "auth", token: "token-invalido" });
    expect(r.abriu).toBe(true);
    expect(r.fechou).toBe(true);
  });

  test("a presença também recusa conexão sem autenticação", async ({ page, baseURL }) => {
    await page.goto(baseURL!);
    const r = await sondar(page, "/api/ws/presence", null);
    expect(r.abriu).toBe(true);
    expect(r.fechou).toBe(true);
  });
});
