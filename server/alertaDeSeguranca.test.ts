import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enviados: string[] = [];
vi.mock("./telegram", () => ({
  enviarTelegram: async (texto: string) => {
    enviados.push(texto);
    return true;
  },
}));

const { JANELA_MS, PAUSA_ENTRE_AVISOS_MS, registrarEventoDeSeguranca, zerarAlertasDeSeguranca } = await import("./alertaDeSeguranca");
const { limitarRequisicoes } = await import("./_core/seguranca");

describe("alerta de atividade suspeita", () => {
  beforeEach(() => {
    zerarAlertasDeSeguranca();
    enviados.length = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("só avisa quando os códigos errados passam do limite na janela", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 9; i++) expect(registrarEventoDeSeguranca("codigoErrado", t0 + i)).toBeNull();
    const aviso = registrarEventoDeSeguranca("codigoErrado", t0 + 9);
    expect(aviso).toContain("10 códigos de acesso errados");
    expect(enviados).toHaveLength(1);
  });

  it("erros espalhados além da janela não somam", () => {
    for (let i = 0; i < 20; i++) expect(registrarEventoDeSeguranca("codigoErrado", i * JANELA_MS)).toBeNull();
  });

  it("um aviso por tipo por hora, mesmo com o ataque continuando", () => {
    const t0 = 5_000_000;
    for (let i = 0; i < 3; i++) registrarEventoDeSeguranca("limiteDaApi", t0 + i);
    for (let i = 0; i < 30; i++) registrarEventoDeSeguranca("limiteDaApi", t0 + 10 + i);
    expect(enviados).toHaveLength(1);
    // Outro tipo tem a sua própria pausa.
    for (let i = 0; i < 3; i++) registrarEventoDeSeguranca("limiteDoVideo", t0 + i);
    expect(enviados).toHaveLength(2);
    // Passada a hora, se continuar, avisa de novo.
    const depois = t0 + PAUSA_ENTRE_AVISOS_MS + 1;
    for (let i = 0; i < 3; i++) registrarEventoDeSeguranca("limiteDaApi", depois + i);
    expect(enviados).toHaveLength(3);
  });

  it("a mensagem não leva dado de ninguém", () => {
    for (let i = 0; i < 10; i++) registrarEventoDeSeguranca("codigoErrado", 7_000_000 + i);
    expect(enviados[0]).not.toMatch(/@|\d+\.\d+\.\d+\.\d+/);
  });
});

describe("limitarRequisicoes: aoBloquear", () => {
  it("dispara uma vez por cliente na janela, no primeiro pedido barrado", () => {
    const aoBloquear = vi.fn();
    const limitar = limitarRequisicoes({ janelaMs: 60_000, maximo: 2, mensagem: "calma", aoBloquear });
    const req = { get: (n: string) => (n === "cf-connecting-ip" ? "203.0.113.5" : undefined), socket: {} };
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) };
    const next = vi.fn();
    for (let i = 0; i < 6; i++) limitar(req as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(aoBloquear).toHaveBeenCalledTimes(1);
  });
});
