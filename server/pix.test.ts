import { describe, expect, it } from "vitest";
import { crc16Pix, montarPixEstatico, normalizarChavePix, pixComValor } from "../shared/pix";

// Código FICTÍCIO no mesmo formato do da conta (estático, chave aleatória, sem
// valor) — o real fica só em client/src/lib/suporte.ts.
const semCrc =
  "00020126580014BR.GOV.BCB.PIX0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913FULANO DE TAL6006RECIFE62140510ABCDE123456304";
const ESTATICO = semCrc + crc16Pix(semCrc);

describe("Pix copia e cola com valor", () => {
  it("CRC16 do padrão (vetor de teste '123456789' = 29B1)", () => {
    expect(crc16Pix("123456789")).toBe("29B1");
  });

  it("põe o valor no campo 54, logo depois da moeda, e refaz o CRC", () => {
    const codigo = pixComValor(ESTATICO, 7600);
    expect(codigo).toContain("5303986540576.005802BR");
    expect(codigo.slice(-8, -4)).toBe("6304");
    expect(codigo.slice(-4)).toBe(crc16Pix(codigo.slice(0, -4)));
  });

  it("mantém a chave, o nome e a cidade", () => {
    const codigo = pixComValor(ESTATICO, 105000);
    expect(codigo).toContain("0136123e4567-e89b-12d3-a456-426614174000");
    expect(codigo).toContain("5913FULANO DE TAL6006RECIFE");
    expect(codigo).toContain("54071050.00");
  });

  it("monta o código da psicóloga a partir da chave (nome sem acento, cidade cortada)", () => {
    const codigo = montarPixEstatico({ chave: "+5581999990000", nome: "Ana Lúcia Conceição", cidade: "São José dos Campos" });
    expect(codigo).toContain("0014br.gov.bcb.pix0114+5581999990000");
    expect(codigo).toContain("5919Ana Lucia Conceicao");
    expect(codigo).toContain("6015Sao Jose dos Ca");
    expect(codigo.slice(-4)).toBe(crc16Pix(codigo.slice(0, -4)));
    // E aceita o valor depois, como o da conta do VozInterior.
    const comValor = pixComValor(codigo, 15000);
    expect(comValor).toContain("5406150.00");
    expect(comValor.slice(-4)).toBe(crc16Pix(comValor.slice(0, -4)));
  });

  it.each([
    ["cpf_cnpj", "123.456.789-09", "12345678909"],
    ["cpf_cnpj", "12.345.678/0001-95", "12345678000195"],
    ["cpf_cnpj", "123", null],
    ["celular", "(81) 99999-0000", "+5581999990000"],
    ["celular", "+55 81 99999-0000", "+5581999990000"],
    ["celular", "(81) 3333-0000", null],
    ["email", " Ana@Exemplo.com ", "ana@exemplo.com"],
    ["email", "ana@", null],
    ["aleatoria", "123E4567-E89B-12D3-A456-426614174000", "123e4567-e89b-12d3-a456-426614174000"],
    ["aleatoria", "nao-e-chave", null],
  ] as const)("chave %s %s → %s", (tipo, valor, esperado) => {
    expect(normalizarChavePix(tipo, valor)).toBe(esperado);
  });

  it("trocar o valor não acumula campos", () => {
    const duas = pixComValor(pixComValor(ESTATICO, 7600), 9500);
    expect(duas.match(/5303986(54\d\d[\d.]+)5802/)?.[1]).toBe("540595.00");
  });
});
