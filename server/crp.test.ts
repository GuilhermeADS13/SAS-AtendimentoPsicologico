import { describe, expect, it } from "vitest";
import { maskCrp, isValidCrp } from "@shared/crp";

describe("máscara do CRP", () => {
  it("põe a barra sozinha depois do segundo dígito", () => {
    expect(maskCrp("0")).toBe("0");
    expect(maskCrp("02")).toBe("02");
    expect(maskCrp("023")).toBe("02/3");
    expect(maskCrp("0231234")).toBe("02/31234");
  });

  it("descarta tudo que não for número", () => {
    expect(maskCrp("02abc31234")).toBe("02/31234");
    expect(maskCrp("CRP 02/31234")).toBe("02/31234");
    expect(maskCrp("02 / 3 12 34")).toBe("02/31234");
    expect(maskCrp("!@#$")).toBe("");
  });

  it("não deixa passar de 8 dígitos (2 da região + 6 da inscrição)", () => {
    expect(maskCrp("0231234599999")).toBe("02/312345");
  });

  // A barra é derivada dos dígitos, não digitada: apagar tem que ser previsível
  // e nunca travar num estado tipo "02/" que a pessoa não consegue desfazer.
  it("apagar de trás para frente desfaz a barra", () => {
    expect(maskCrp("02/3")).toBe("02/3");
    expect(maskCrp("02/")).toBe("02");
    expect(maskCrp("0")).toBe("0");
    expect(maskCrp("")).toBe("");
  });

  it("é idempotente (remascarar não muda o valor)", () => {
    expect(maskCrp(maskCrp("0231234"))).toBe("02/31234");
  });

  it("aceita o que o backend aceita, e recusa o resto", () => {
    expect(isValidCrp("02/31234")).toBe(true);
    expect(isValidCrp("06/123")).toBe(true);
    expect(isValidCrp("06/1234567")).toBe(false); // inscrição longa demais
    expect(isValidCrp("6/123456")).toBe(false); // região com 1 dígito
    expect(isValidCrp("0631234")).toBe(false); // sem barra
    expect(isValidCrp("")).toBe(false);
  });

  it("a máscara completa sempre produz um CRP que o backend aceita", () => {
    expect(isValidCrp(maskCrp("0231234"))).toBe(true);
    expect(isValidCrp(maskCrp("06123456"))).toBe(true);
  });
});
