import { describe, expect, it } from "vitest";
import { IDS_DA_TABELA, PLANOS, ehPlanoDaTabela, formatarReais, planoPara, precoDoPlano } from "../shared/precos";

// Preço FIXO por plano, estilo Netflix (decisão de 2026-10-27); faixas de 11 em 2026-11-12.
describe("tabela de preços", () => {
  it("a Luma no prontuário vem do Voz para cima; o relatório, do Canto para cima", () => {
    expect(PLANOS.map((p) => [p.id, p.lumaNoProntuario, p.relatorioDeGestao])).toEqual([
      ["pro", false, false],
      ["max", true, false],
      ["canto", true, true],
      ["coro", true, true],
      ["unlimited", true, true],
    ]);
  });

  it("Sussurro R$ 31, Voz R$ 81, Canto R$ 151 e Coro R$ 241 por mês; Sob medida combinado", () => {
    expect(precoDoPlano("pro")).toBe(3100);
    expect(precoDoPlano("max")).toBe(8100);
    expect(precoDoPlano("canto")).toBe(15100);
    expect(precoDoPlano("coro")).toBe(24100);
    expect(precoDoPlano("unlimited")).toBeNull();
  });

  it("Psicóloga Fundadora paga 20% a menos; anual = 10 meses do valor com desconto", () => {
    expect(precoDoPlano("pro", { fundador: true })).toBe(2480);
    expect(precoDoPlano("max", { fundador: true })).toBe(6480);
    expect(precoDoPlano("canto", { fundador: true })).toBe(12080);
    expect(precoDoPlano("coro", { fundador: true })).toBe(19280);
    expect(precoDoPlano("pro", { ciclo: "anual" })).toBe(31000);
    expect(precoDoPlano("max", { fundador: true, ciclo: "anual" })).toBe(64800);
  });

  it("as faixas são contínuas, de 11 em 11, sem buraco nem sobreposição", () => {
    const daTabela = PLANOS.filter((p) => p.ate !== null);
    expect(daTabela.map((p) => [p.de, p.ate])).toEqual([
      [1, 11],
      [12, 22],
      [23, 33],
      [34, 44],
    ]);
    expect(PLANOS[PLANOS.length - 1].de).toBe(45);
  });

  it("o plano indicado acompanha o número de pacientes", () => {
    expect(planoPara(1).nome).toBe("Sussurro");
    expect(planoPara(11).nome).toBe("Sussurro");
    expect(planoPara(12).nome).toBe("Voz");
    expect(planoPara(22).nome).toBe("Voz");
    expect(planoPara(23).nome).toBe("Canto");
    expect(planoPara(33).nome).toBe("Canto");
    expect(planoPara(34).nome).toBe("Coro");
    expect(planoPara(44).nome).toBe("Coro");
    expect(planoPara(45).nome).toBe("Sob medida");
    expect(planoPara(45).id).toBe("unlimited");
  });

  it("só os planos de preço fixo se escolhem sozinha", () => {
    expect(IDS_DA_TABELA).toEqual(["pro", "max", "canto", "coro"]);
    expect(ehPlanoDaTabela("canto")).toBe(true);
    expect(ehPlanoDaTabela("unlimited")).toBe(false);
    expect(ehPlanoDaTabela(null)).toBe(false);
  });

  it("formata em reais sem centavos quando é inteiro", () => {
    expect(formatarReais(3100)).toMatch(/^R\$\s?31$/);
    expect(formatarReais(2480)).toMatch(/^R\$\s?24,80$/);
  });
});
