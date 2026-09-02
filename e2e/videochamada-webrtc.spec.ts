import { test, expect, chromium, type Page } from "@playwright/test";

/**
 * Videochamada 1:1 ponta a ponta, com DOIS participantes de verdade.
 *
 * Por que este teste existe: a videochamada é a única parte do sistema que não dá
 * para conferir abrindo uma aba só — é preciso ter os dois lados ao mesmo tempo.
 * Foi justamente aí que passou um bug sério: com dois WebSocketServer no mesmo
 * servidor HTTP, o primeiro abortava (400) o upgrade do path do outro e a
 * sinalização nunca conectava. Este teste falha se isso voltar a acontecer.
 *
 * O que ele exercita de verdade: o servidor de sinalização (/api/ws/rtc) e o
 * mesmo protocolo do cliente (terapeuta oferece, paciente responde, ICE dos dois
 * lados). Não depende de login nem de agendamento — o objetivo é a negociação,
 * não a tela.
 *
 * Mídia: o Chromium entra com câmera/microfone falsos (flags abaixo), então roda
 * headless, sem hardware. ICE sem STUN de propósito: os dois peers estão na mesma
 * máquina, então candidatos locais bastam e o teste não depende da internet.
 */

const SALA = `e2e-${Date.now()}`;
const TEMPO_LIMITE = 20_000;

/** Roda no navegador: conecta na sinalização, negocia e avisa quando recebe mídia. */
async function participar(page: Page, sala: string, papel: "therapist" | "patient") {
  return page.evaluate(
    async ([sala, papel, limite]) => {
      const janela = window as unknown as { __rtc?: Promise<string> };
      janela.__rtc = new Promise<string>((resolve, reject) => {
        const falhar = setTimeout(() => reject(new Error(`${papel}: tempo esgotado`)), Number(limite));
        const pc = new RTCPeerConnection({ iceServers: [] });
        const pendentes: RTCIceCandidateInit[] = [];
        let recebeuMidia = false;

        navigator.mediaDevices
          .getUserMedia({ video: true, audio: true })
          .then(stream => {
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const proto = location.protocol === "https:" ? "wss" : "ws";
            const ws = new WebSocket(`${proto}://${location.host}/api/ws/rtc?room=${sala}&role=${papel}`);
            const enviar = (m: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

            pc.onicecandidate = e => e.candidate && enviar({ type: "candidate", candidate: e.candidate.toJSON() });
            pc.ontrack = () => {
              recebeuMidia = true;
              // "connected" pode chegar antes ou depois da mídia; o teste só passa
              // quando os DOIS aconteceram — é isso que prova a chamada de pé.
              if (pc.connectionState === "connected") {
                clearTimeout(falhar);
                resolve("ok");
              }
            };
            pc.onconnectionstatechange = () => {
              if (pc.connectionState === "connected" && recebeuMidia) {
                clearTimeout(falhar);
                resolve("ok");
              }
              if (pc.connectionState === "failed") {
                clearTimeout(falhar);
                reject(new Error(`${papel}: conexão falhou`));
              }
            };

            ws.onerror = () => reject(new Error(`${papel}: sinalização não conectou`));
            ws.onmessage = async ev => {
              const msg = JSON.parse(ev.data);
              // Mesmo protocolo do app: só a terapeuta oferece (evita glare).
              if (msg.type === "start" && papel === "therapist" && pc.signalingState === "stable") {
                const oferta = await pc.createOffer();
                await pc.setLocalDescription(oferta);
                enviar({ type: "offer", sdp: oferta.sdp });
              } else if (msg.type === "offer") {
                await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
                for (const c of pendentes.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c));
                const resposta = await pc.createAnswer();
                await pc.setLocalDescription(resposta);
                enviar({ type: "answer", sdp: resposta.sdp });
              } else if (msg.type === "answer") {
                await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
                for (const c of pendentes.splice(0)) await pc.addIceCandidate(new RTCIceCandidate(c));
              } else if (msg.type === "candidate" && msg.candidate) {
                if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
                else pendentes.push(msg.candidate);
              }
            };
          })
          .catch(reject);
      });
    },
    [sala, papel, String(TEMPO_LIMITE)] as const,
  );
}

test.describe("videochamada WebRTC 1:1", () => {
  test("terapeuta e paciente conectam e recebem mídia um do outro", async ({ baseURL }) => {
    // Navegador próprio: precisa das flags de mídia falsa, que a config global
    // não usa (os outros testes não mexem com câmera).
    const navegador = await chromium.launch({
      // Sem env definida, usa o Chromium que o próprio Playwright instala — assim
      // roda tanto no container do CI quanto na máquina de quem desenvolve.
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });

    try {
      // Dois contextos = duas pessoas diferentes, como na vida real.
      const terapeuta = await (await navegador.newContext()).newPage();
      const paciente = await (await navegador.newContext()).newPage();

      // Precisam estar na origem do app para o WebSocket relativo funcionar.
      await terapeuta.goto(baseURL!);
      await paciente.goto(baseURL!);

      await participar(terapeuta, SALA, "therapist");
      await participar(paciente, SALA, "patient");

      const espera = (p: Page) => p.evaluate(() => (window as unknown as { __rtc: Promise<string> }).__rtc);
      const [ladoTerapeuta, ladoPaciente] = await Promise.all([espera(terapeuta), espera(paciente)]);

      expect(ladoTerapeuta).toBe("ok");
      expect(ladoPaciente).toBe("ok");
    } finally {
      await navegador.close();
    }
  });
});
