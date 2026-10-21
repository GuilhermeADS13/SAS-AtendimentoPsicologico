import { describe, expect, it } from "vitest";
import { descreverFrequencia, gravarFrequencia, lerFrequencia } from "@shared/frequencia";

describe("frequência definida pela psicóloga", () => {
  it("padrões", () => {
    expect(lerFrequencia("quinzenal")).toEqual({ tipo: "quinzenal" });
    expect(descreverFrequencia({ tipo: "semanal" })).toBe("Semanal");
    expect(gravarFrequencia({ tipo: "mensal" })).toBe("mensal");
  });

  it("dias da semana: grava ordenado (segunda primeiro) e descreve por extenso", () => {
    expect(gravarFrequencia({ tipo: "dias", dias: [4, 2, 2] })).toBe("dias:2,4");
    expect(gravarFrequencia({ tipo: "dias", dias: [0, 1] })).toBe("dias:1,0"); // domingo por último
    expect(descreverFrequencia(lerFrequencia("dias:2,4")!)).toBe("Terças e quintas");
    expect(descreverFrequencia(lerFrequencia("dias:1,3,5")!)).toBe("Segundas, quartas e sextas");
    expect(descreverFrequencia(lerFrequencia("dias:6")!)).toBe("Todo sábado");
    expect(descreverFrequencia(lerFrequencia("dias:3")!)).toBe("Toda quarta");
  });

  it("nenhum dia marcado = sem frequência definida", () => {
    expect(gravarFrequencia({ tipo: "dias", dias: [] })).toBeNull();
    expect(gravarFrequencia(null)).toBeNull();
  });

  it("texto fora do formato é ignorado (cai no cálculo automático)", () => {
    for (const t of ["", "diario", "dias:", "dias:7", "dias:1,,2", "semanal ", null, undefined]) {
      expect(lerFrequencia(t as string), String(t)).toBeNull();
    }
  });
});
