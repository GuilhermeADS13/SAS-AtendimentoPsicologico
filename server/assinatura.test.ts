import { describe, expect, it } from "vitest";
import {
  diaDeVencimentoValido,
  diaDoVencimentoNoMes,
  diasNoMes,
  decidirTesteEFundador,
  ehCortesia,
  fimDoTeste,
  novoPagoAte,
  normalizarDocumento,
  precisaAvisarVencimento,
  situacaoDaAssinatura,
} from "../shared/assinatura";
import { valorDoPlano } from "../shared/precos";
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

  it("cortesia é o pago até 2100; um Pix anual comum não vira isenção", () => {
    expect(ehCortesia(new Date("2100-01-01T02:59:59Z"))).toBe(true);
    expect(ehCortesia(dias(365))).toBe(false);
    expect(ehCortesia(null)).toBe(false);
  });
});

describe("um teste grátis por pessoa", () => {
  it("primeira conta ganha o teste, que aguarda o primeiro paciente, e vaga de fundadora", () => {
    const d = decidirTesteEFundador({ anteriores: [], fundadoresAtuais: 3 });
    expect(d.testeAguardando).toBe(true);
    expect(d.fundador).toBe(true);
  });

  it("aguardando o primeiro paciente: liberada, sem data e sem contar dias", () => {
    const s = situacaoDaAssinatura({ testeAte: null, pagoAte: null, testeAguardando: true }, agora);
    expect(s).toEqual({ liberado: true, motivo: "teste", ate: null, diasRestantes: null });
  });

  it("aguardando vale mais que uma data de teste antiga, e o Pix vale mais que aguardando", () => {
    expect(situacaoDaAssinatura({ testeAte: dias(-5), pagoAte: null, testeAguardando: true }, agora).liberado).toBe(true);
    expect(situacaoDaAssinatura({ testeAte: null, pagoAte: dias(30), testeAguardando: true }, agora).motivo).toBe("pago");
  });

  it("aguardando tem 30 dias a partir da aprovação para cadastrar o primeiro paciente", () => {
    const s = situacaoDaAssinatura({ testeAte: null, pagoAte: null, testeAguardando: true, createdAt: dias(-29) }, agora);
    expect(s).toMatchObject({ liberado: true, motivo: "teste", ate: null, primeiroPacienteAte: dias(1) });
  });

  it("passou de 30 dias sem paciente: pausa, com a data do limite", () => {
    const s = situacaoDaAssinatura({ testeAte: null, pagoAte: null, testeAguardando: true, createdAt: dias(-31) }, agora);
    expect(s).toEqual({ liberado: false, motivo: "vencido", ate: dias(-1), diasRestantes: null });
  });

  it("Pix em dia libera mesmo depois do limite", () => {
    const s = situacaoDaAssinatura({ testeAte: null, pagoAte: dias(10), testeAguardando: true, createdAt: dias(-60) }, agora);
    expect(s.motivo).toBe("pago");
  });

  it("o teste dura 14 dias a partir do primeiro paciente", () => {
    expect(fimDoTeste(agora)).toEqual(dias(14));
  });

  it("CRP ou celular já usados: sem teste, mas herda a fundadora da conta anterior", () => {
    expect(decidirTesteEFundador({ anteriores: [{ fundador: true }], fundadoresAtuais: 20 }))
      .toEqual({ testeAguardando: false, fundador: true });
    expect(decidirTesteEFundador({ anteriores: [{ fundador: false }], fundadoresAtuais: 0 }))
      .toEqual({ testeAguardando: false, fundador: false });
  });

  it("acabaram as 20 vagas de fundadora", () => {
    expect(decidirTesteEFundador({ anteriores: [], fundadoresAtuais: 20 }).fundador).toBe(false);
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
    expect(valorDoPlano(10, "pro")).toBe(3900);
    expect(valorDoPlano(10, "pro", { fundador: true })).toBe(3120);
    expect(valorDoPlano(10, "pro", { ciclo: "anual" })).toBe(39000);
    expect(valorDoPlano(10, "pro", { fundador: true, ciclo: "anual" })).toBe(31200);
    expect(valorDoPlano(31, "pro")).toBeNull();
  });

  it("Sussurro sem paciente não tem o que cobrar (a cobrança começa no 1º)", () => {
    expect(valorDoPlano(0, "pro")).toBe(0);
    expect(valorDoPlano(0, "pro", { fundador: true, ciclo: "anual" })).toBe(0);
    expect(valorDoPlano(1, "pro")).toBe(3900);
  });
});

describe("dia de vencimento escolhido", () => {
  // Fim do dia D em Brasília = D+1 às 02:59:59 UTC.
  const fimDoDia = (iso: string) => new Date(`${iso}T02:59:59.000Z`);

  it("o exemplo combinado: teste acaba 09/11, escolhe dia 25 → liberada até 25/12", () => {
    const testeAte = new Date("2026-11-09T15:00:00Z");
    expect(novoPagoAte({ testeAte, pagoAte: null, diaVencimento: 25 }, "mensal", agora)).toEqual(fimDoDia("2026-12-26"));
  });

  it("nunca menos de 1 mês: dia 5 depois de 09/12 cai em 05/01", () => {
    const testeAte = new Date("2026-11-09T15:00:00Z");
    expect(novoPagoAte({ testeAte, pagoAte: null, diaVencimento: 5 }, "mensal", agora)).toEqual(fimDoDia("2027-01-06"));
  });

  it("depois de ajustado, cada Pix cai no mesmo dia do mês seguinte", () => {
    const pagoAte = fimDoDia("2027-01-06"); // vence 05/01
    const pagandoNoDia = new Date("2027-01-05T12:00:00Z");
    expect(novoPagoAte({ testeAte: null, pagoAte, diaVencimento: 5 }, "mensal", pagandoNoDia)).toEqual(fimDoDia("2027-02-06"));
  });

  it("pagou atrasado: conta a partir de hoje e volta para o dia escolhido", () => {
    const pagoAte = fimDoDia("2026-10-11"); // venceu 10/10
    expect(novoPagoAte({ testeAte: null, pagoAte, diaVencimento: 10 }, "mensal", agora)).toEqual(fimDoDia("2026-12-11"));
  });

  it("anual com dia escolhido", () => {
    const pagoAte = fimDoDia("2026-11-16"); // vence 15/11
    expect(novoPagoAte({ testeAte: null, pagoAte, diaVencimento: 15 }, "anual", agora)).toEqual(fimDoDia("2027-11-16"));
  });
});

describe("dia de vencimento no calendário (1 a 31)", () => {
  const fimDoDia = (iso: string) => new Date(`${iso}T02:59:59.000Z`);

  it("fevereiro não tem dia 31: vence no último dia do mês", () => {
    expect(diasNoMes(2027, 1)).toBe(28);
    expect(diasNoMes(2028, 1)).toBe(29); // bissexto
    expect(diaDoVencimentoNoMes(2027, 1, 31)).toBe(28);
    expect(diaDoVencimentoNoMes(2028, 1, 30)).toBe(29);
    expect(diaDoVencimentoNoMes(2027, 3, 31)).toBe(30); // abril
    expect(diaDoVencimentoNoMes(2027, 0, 31)).toBe(31);
  });

  it("dia 31 escolhido: o Pix que cai em fevereiro vai até 28/02 (não transborda para março)", () => {
    const pagoAte = fimDoDia("2027-02-01"); // venceu 31/01
    const fev = novoPagoAte({ testeAte: null, pagoAte, diaVencimento: 31 }, "mensal", new Date("2027-01-31T12:00:00Z"));
    expect(fev).toEqual(fimDoDia("2027-03-01")); // fim do dia 28/02 em Brasília
  });

  it("depois de fevereiro, volta a vencer no dia 31", () => {
    const pagoAte = fimDoDia("2027-03-01"); // vence 28/02
    const mar = novoPagoAte({ testeAte: null, pagoAte, diaVencimento: 31 }, "mensal", new Date("2027-02-28T12:00:00Z"));
    expect(mar).toEqual(fimDoDia("2027-04-01")); // fim do dia 31/03
  });

  it("aceita qualquer dia de 1 a 31", () => {
    expect(diaDeVencimentoValido(1)).toBe(true);
    expect(diaDeVencimentoValido(31)).toBe(true);
    expect(diaDeVencimentoValido(0)).toBe(false);
    expect(diaDeVencimentoValido(32)).toBe(false);
    expect(diaDeVencimentoValido(7.5)).toBe(false);
  });
});

describe("e-mail de vencimento", () => {
  const s = (ate: Date) => situacaoDaAssinatura({ testeAte: null, pagoAte: ate }, agora);

  it("avisa com até 3 dias de antecedência, uma vez por vencimento", () => {
    expect(precisaAvisarVencimento(s(dias(5)), null, agora)).toBe(false);
    expect(precisaAvisarVencimento(s(dias(2)), null, agora)).toBe(true);
    expect(precisaAvisarVencimento(s(dias(2)), dias(2), agora)).toBe(false);
    // Renovou: o vencimento novo é outro, mas só avisa quando chegar perto.
    expect(precisaAvisarVencimento(s(dias(32)), dias(2), agora)).toBe(false);
  });

  it("não avisa quem já venceu (o aviso vermelho do topo cuida disso)", () => {
    expect(precisaAvisarVencimento(s(dias(-1)), null, agora)).toBe(false);
  });
});

describe("cota da Luma por dia", () => {
  it("o dia vira à meia-noite de Brasília, não à de Londres", () => {
    // 02:00 UTC do dia 27 ainda é 23:00 do dia 26 em Brasília.
    expect(inicioDoDiaEmBrasilia(new Date("2026-10-27T02:00:00Z")).toISOString()).toBe("2026-10-26T03:00:00.000Z");
    expect(inicioDoDiaEmBrasilia(new Date("2026-10-27T03:00:00Z")).toISOString()).toBe("2026-10-27T03:00:00.000Z");
  });
});
