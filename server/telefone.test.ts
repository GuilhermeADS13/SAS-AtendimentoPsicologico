import { describe, expect, it } from "vitest";
import { celularValido, mascaraTelefone } from "@shared/telefone";

describe("celularValido", () => {
  it("aceita celular com DDD, com ou sem máscara", () => {
    expect(celularValido("(81) 99999-0000")).toBe(true);
    expect(celularValido("11987654321")).toBe(true);
  });

  it("recusa fixo, sem DDD, curto demais e DDD inválido", () => {
    for (const v of ["(81) 3333-4444", "99999-0000", "8199999000", "", "(01) 99999-0000", "(10) 99999-0000"]) {
      expect(celularValido(v), v).toBe(false);
    }
  });
});

describe("mascaraTelefone", () => {
  it("formata enquanto digita", () => {
    expect(mascaraTelefone("8")).toBe("(8");
    expect(mascaraTelefone("81999")).toBe("(81) 999");
    expect(mascaraTelefone("81999990000")).toBe("(81) 99999-0000");
    expect(mascaraTelefone("8133334444")).toBe("(81) 3333-4444");
  });

  it("corta o que passar de 11 dígitos", () => {
    expect(mascaraTelefone("819999900001234")).toBe("(81) 99999-0000");
  });
});
