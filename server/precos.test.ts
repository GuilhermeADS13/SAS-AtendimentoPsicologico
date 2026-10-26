import { describe, expect, it } from "vitest";
import { formatarReais, mensalidadeEmCentavos, planoPara } from "../shared/precos";

describe("tabela de preços por paciente", () => {
  // Os dois primeiros pontos são o exemplo do Guilherme; os outros são os que a
  // página de preços mostra e foram aprovados.
  it.each([
    [1, 2000],
    [2, 4000],
    [4, 7500],
    [10, 10500],
    [20, 13000],
    [30, 14500],
  ])("%i pacientes custam %i centavos", (pacientes, centavos) => {
    expect(mensalidadeEmCentavos(pacientes)).toBe(centavos);
  });

  it("cada paciente a mais nunca baixa o total nem encarece o anterior", () => {
    let anterior = 0;
    let custoAnterior = Infinity;
    for (let n = 1; n <= 30; n++) {
      const total = mensalidadeEmCentavos(n)!;
      const custoDoNovo = total - anterior;
      expect(custoDoNovo).toBeGreaterThan(0);
      expect(custoDoNovo).toBeLessThanOrEqual(custoAnterior);
      anterior = total;
      custoAnterior = custoDoNovo;
    }
  });

  it("acima de 30 pacientes o preço é combinado (Unlimited)", () => {
    expect(mensalidadeEmCentavos(31)).toBeNull();
    expect(planoPara(31).id).toBe("unlimited");
  });

  it("separa Pro (até 10) de Max (11 a 30)", () => {
    expect(planoPara(1).id).toBe("pro");
    expect(planoPara(10).id).toBe("pro");
    expect(planoPara(11).id).toBe("max");
    expect(planoPara(30).id).toBe("max");
  });

  it("formata em reais sem centavos quando é inteiro", () => {
    expect(formatarReais(4000)).toMatch(/^R\$\s?40$/);
    expect(formatarReais(5750)).toMatch(/^R\$\s?57,50$/);
  });
});
