import { describe, expect, it } from "vitest";
import { formatarReais, planoPara, precoDoPlano } from "../shared/precos";

// Preço FIXO por plano, estilo Netflix (decisão de 2026-10-27).
describe("tabela de preços", () => {
  it("Sussurro R$ 69 e Voz R$ 129 por mês; Coro combinado", () => {
    expect(precoDoPlano("pro")).toBe(6900);
    expect(precoDoPlano("max")).toBe(12900);
    expect(precoDoPlano("unlimited")).toBeNull();
  });

  it("Psicóloga Fundadora paga 20% a menos; anual = 10 meses do valor com desconto", () => {
    expect(precoDoPlano("pro", { fundador: true })).toBe(5520);
    expect(precoDoPlano("max", { fundador: true })).toBe(10320);
    expect(precoDoPlano("pro", { ciclo: "anual" })).toBe(69000);
    expect(precoDoPlano("max", { fundador: true, ciclo: "anual" })).toBe(103200);
  });

  it("o plano indicado acompanha o número de pacientes", () => {
    expect(planoPara(1).nome).toBe("Sussurro");
    expect(planoPara(10).nome).toBe("Sussurro");
    expect(planoPara(11).nome).toBe("Voz");
    expect(planoPara(30).nome).toBe("Voz");
    expect(planoPara(31).nome).toBe("Coro");
    expect(planoPara(1).id).toBe("pro");
    expect(planoPara(31).id).toBe("unlimited");
  });

  it("formata em reais sem centavos quando é inteiro", () => {
    expect(formatarReais(6900)).toMatch(/^R\$\s?69$/);
    expect(formatarReais(5520)).toMatch(/^R\$\s?55,20$/);
  });
});
