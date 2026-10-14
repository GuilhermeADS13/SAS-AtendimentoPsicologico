/**
 * Sons curtos da interface, gerados pela Web Audio API — sem arquivo de áudio
 * para baixar/empacotar.
 *
 * Política de autoplay: o navegador só toca som depois de alguma interação na
 * página. Como a psicóloga usa o app (clica, navega), o áudio já está liberado
 * quando um som dispara. Se por acaso não estiver, falha em silêncio.
 */

type Nota = { freq: number; inicio: number; dur: number };

function tocar(notas: Nota[], volume: number) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    // Criado fora de um clique (ex.: aviso que chega pela busca automática), o
    // contexto pode nascer "suspenso"; com a página já usada, retomar libera.
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime;
    let fim = 0;

    for (const n of notas) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;

      const t = t0 + n.inicio;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + n.dur + 0.05);
      fim = Math.max(fim, n.inicio + n.dur);
    }

    setTimeout(() => ctx.close().catch(() => {}), (fim + 0.3) * 1000);
  } catch {
    /* áudio indisponível — não é crítico */
  }
}

/** Paciente entrou na sala: "ding-dong" ascendente, em volume audível. */
export function playPresenceChime() {
  tocar(
    [
      { freq: 880, inicio: 0, dur: 0.3 }, // A5
      { freq: 1174.66, inicio: 0.16, dur: 0.34 }, // D6
    ],
    0.6,
  );
}

/**
 * Notificação nova (toca junto com o aviso na tela): duas notas curtas, "plim-
 * plim" — mais fácil de perceber que o ping de uma nota só, e diferente do
 * "ding-dong" de paciente entrando na sala.
 */
export function playNotificationPing() {
  tocar(
    [
      { freq: 1318.51, inicio: 0, dur: 0.18 }, // E6
      { freq: 1567.98, inicio: 0.12, dur: 0.26 }, // G6
    ],
    0.5,
  );
}
