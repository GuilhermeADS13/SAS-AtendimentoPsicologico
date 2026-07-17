/**
 * Toca um "ding-dong" curto quando o paciente entra na sala, para a psicóloga
 * perceber mesmo sem olhar a tela.
 *
 * Gerado pela Web Audio API — sem arquivo de áudio para baixar/empacotar. Como
 * a psicóloga já clicou para entrar na sala, o navegador permite o som (a
 * política de autoplay exige uma interação prévia, que já houve). Se por algum
 * motivo o áudio estiver bloqueado, falha em silêncio.
 */
export function playPresenceChime() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const inicio = ctx.currentTime;

    // Duas notas ascendentes agradáveis (A5 → D6).
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const t = inicio + i * 0.16;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });

    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* áudio indisponível — não é crítico */
  }
}
