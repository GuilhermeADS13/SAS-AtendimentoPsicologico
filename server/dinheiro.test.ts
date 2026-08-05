import { describe, expect, it } from "vitest";
import { reaisParaCentavos, formatarBRL, centavosParaInput } from "@shared/dinheiro";

describe("reaisParaCentavos", () => {
  it("converte inteiro e decimal", () => {
    expect(reaisParaCentavos("150")).toBe(15000);
    expect(reaisParaCentavos("150,50")).toBe(15050);
    expect(reaisParaCentavos("150.50")).toBe(15050);
    expect(reaisParaCentavos(150)).toBe(15000);
  });

  it("aceita o valor já formatado (com R$ e separador de milhar)", () => {
    expect(reaisParaCentavos("R$ 1.234,56")).toBe(123456);
  });

  it("não acumula erro de float", () => {
    // 0,1 + 0,2 em float dá 0,30000000000000004; em centavos é exato.
    expect(reaisParaCentavos("0,10")! + reaisParaCentavos("0,20")!).toBe(30);
  });

  it("vazio ou inválido vira null", () => {
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos(null)).toBeNull();
    expect(reaisParaCentavos(undefined)).toBeNull();
    expect(reaisParaCentavos("abc")).toBeNull();
  });
});

describe("formatarBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    //   = espaço não-quebrável que o Intl usa entre "R$" e o número.
    expect(formatarBRL(15000).replace(/ /g, " ")).toBe("R$ 150,00");
    expect(formatarBRL(15050).replace(/ /g, " ")).toBe("R$ 150,50");
    expect(formatarBRL(0).replace(/ /g, " ")).toBe("R$ 0,00");
  });

  it("null/undefined viram o traço", () => {
    expect(formatarBRL(null)).toBe("—");
    expect(formatarBRL(undefined)).toBe("—");
    expect(formatarBRL(null, "sem valor")).toBe("sem valor");
  });
});

describe("centavosParaInput", () => {
  it("volta para o formato editável com vírgula", () => {
    expect(centavosParaInput(15000)).toBe("150,00");
    expect(centavosParaInput(15050)).toBe("150,50");
    expect(centavosParaInput(null)).toBe("");
  });

  it("faz o ciclo input→centavos→input sem perder valor", () => {
    expect(centavosParaInput(reaisParaCentavos("150,50"))).toBe("150,50");
  });
});
