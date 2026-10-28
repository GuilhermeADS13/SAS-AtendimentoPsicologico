import { describe, expect, it } from "vitest";
import { PLANOS, formatarReais, planoPara, precoDoPlano } from "../shared/precos";

// Preço FIXO por plano, estilo Netflix (decisão de 2026-10-27).
describe("tabela de preços", () => {
  it("a ajuda da Luma no prontuário é diferencial do Voz e do Coro (não do Sussurro)", () => {
    expect(PLANOS.map((p) => [p.id, p.lumaNoProntuario])).toEqual([
      ["pro", false],
      ["max", true],
      ["unlimited", true],
    ]);
  });

  it("Sussurro R$ 39 e Voz R$ 89 por mês; Coro combinado", () => {
    expect(precoDoPlano("pro")).toBe(3900);
    expect(precoDoPlano("max")).toBe(8900);
    expect(precoDoPlano("unlimited")).toBeNull();
  });

  it("Psicóloga Fundadora paga 20% a menos; anual = 10 meses do valor com desconto", () => {
    expect(precoDoPlano("pro", { fundador: true })).toBe(3120);
    expect(precoDoPlano("max", { fundador: true })).toBe(7120);
    expect(precoDoPlano("pro", { ciclo: "anual" })).toBe(39000);
    expect(precoDoPlano("max", { fundador: true, ciclo: "anual" })).toBe(71200);
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
    expect(formatarReais(3900)).toMatch(/^R\$\s?39$/);
    expect(formatarReais(3120)).toMatch(/^R\$\s?31,20$/);
  });
});
