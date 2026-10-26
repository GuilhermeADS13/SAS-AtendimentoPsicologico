import { describe, expect, it } from "vitest";
import { crc16Pix, pixComValor } from "../shared/pix";

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

  it("trocar o valor não acumula campos", () => {
    const duas = pixComValor(pixComValor(ESTATICO, 7600), 9500);
    expect(duas.match(/5303986(54\d\d[\d.]+)5802/)?.[1]).toBe("540595.00");
  });
});
