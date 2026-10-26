import { describe, expect, it } from "vitest";
import { decidirTesteEFundador, novoPagoAte, normalizarDocumento, situacaoDaAssinatura } from "../shared/assinatura";
import { valorDaCobranca } from "../shared/precos";
import { inicioDoDiaEmBrasilia } from "./assinaturas";

const agora = new Date("2026-10-26T15:00:00Z");
const dias = (n: number) => new Date(agora.getTime() + n * 24 * 60 * 60 * 1000);

describe("situação da assinatura", () => {
  it("teste em andamento libera e conta os dias", () => {
    const s = situacaoDaAssinatura({ testeAte: dias(14), pagoAte: null }, agora);
    expect(s).toMatchObject({ liberado: true, motivo: "teste", diasRestantes: 14 });
  });

  it("Pix em dia vale mais que o teste", () => {
    expect(situacaoDaAssinatura({ testeAte: dias(3), pagoAte: dias(30) }, agora).motivo).toBe("pago");
  });

  it("teste e Pix no passado = vencido (bloqueia o uso novo)", () => {
    const s = situacaoDaAssinatura({ testeAte: dias(-20), pagoAte: dias(-2) }, agora);
    expect(s.liberado).toBe(false);
    expect(s.motivo).toBe("vencido");
    expect(s.ate).toEqual(dias(-2));
  });

  it("sem assinatura não libera", () => {
    expect(situacaoDaAssinatura(null, agora).liberado).toBe(false);
  });
});

describe("um teste grátis por pessoa", () => {
  it("primeira conta ganha 14 dias e vaga de fundadora", () => {
    const d = decidirTesteEFundador({ anteriores: [], fundadoresAtuais: 3 }, agora);
    expect(d.testeAte).toEqual(dias(14));
    expect(d.fundador).toBe(true);
  });

  it("CRP ou celular já usados: sem teste, mas herda a fundadora da conta anterior", () => {
    expect(decidirTesteEFundador({ anteriores: [{ fundador: true }], fundadoresAtuais: 20 }, agora))
      .toEqual({ testeAte: null, fundador: true });
    expect(decidirTesteEFundador({ anteriores: [{ fundador: false }], fundadoresAtuais: 0 }, agora))
      .toEqual({ testeAte: null, fundador: false });
  });

  it("acabaram as 20 vagas de fundadora", () => {
    expect(decidirTesteEFundador({ anteriores: [], fundadoresAtuais: 20 }, agora).fundador).toBe(false);
  });

  it("CRP com ou sem barra é o mesmo", () => {
    expect(normalizarDocumento("06/123456")).toBe(normalizarDocumento("06123456"));
  });
});

describe("Pix e valores", () => {
  it("Pix pago durante o teste soma a partir do fim do teste", () => {
    const fim = novoPagoAte({ testeAte: dias(10), pagoAte: null }, "mensal", agora);
    const esperado = dias(10);
    esperado.setMonth(esperado.getMonth() + 1);
    expect(fim).toEqual(esperado);
  });

  it("anual soma 12 meses", () => {
    const fim = novoPagoAte({ testeAte: null, pagoAte: null }, "anual", agora);
    expect(fim.getUTCFullYear()).toBe(2027);
  });

  it("fundadora paga 20% a menos; anual = 10 meses", () => {
    expect(valorDaCobranca(10)).toBe(10500);
    expect(valorDaCobranca(10, { fundador: true })).toBe(8400);
    expect(valorDaCobranca(10, { ciclo: "anual" })).toBe(105000);
    expect(valorDaCobranca(10, { fundador: true, ciclo: "anual" })).toBe(84000);
    expect(valorDaCobranca(31)).toBeNull();
  });
});

describe("cota da Luma por dia", () => {
  it("o dia vira à meia-noite de Brasília, não à de Londres", () => {
    // 02:00 UTC do dia 27 ainda é 23:00 do dia 26 em Brasília.
    expect(inicioDoDiaEmBrasilia(new Date("2026-10-27T02:00:00Z")).toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(inicioDoDiaEmBrasilia(new Date("2026-10-27T03:00:00Z")).toISOString()).toBe("2026-10-27T03:00:00.000Z");
  });
});
