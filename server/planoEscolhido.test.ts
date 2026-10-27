import { describe, expect, it } from "vitest";
import { cabeMaisUmPaciente, planoEfetivo, valorDoPlano } from "../shared/precos";

// Plano escolhido "como a Netflix" (decisão de 2026-10-26): ela escolhe Sussurro
// ou Voz, ganha os bônus na hora e continua pagando por paciente, com o mínimo
// do plano.
describe("plano escolhido", () => {
  it("Sussurro cobra pela tabela, sem mínimo (0 pacientes = R$ 0)", () => {
    expect(valorDoPlano(0, "pro")).toBe(0);
    expect(valorDoPlano(2, "pro")).toBe(4000);
    expect(valorDoPlano(10, "pro")).toBe(10500);
  });

  it("Voz escolhido cedo, só pelos bônus: paga o mínimo (preço de 11 pacientes)", () => {
    expect(valorDoPlano(5, "max")).toBe(10750);
    expect(valorDoPlano(0, "max")).toBe(10750);
    // Passando do mínimo, volta a seguir a tabela.
    expect(valorDoPlano(20, "max")).toBe(13000);
  });

  it("Fundadora e anual valem por cima do mínimo", () => {
    expect(valorDoPlano(5, "max", { fundador: true })).toBe(8600);
    expect(valorDoPlano(5, "max", { fundador: true, ciclo: "anual" })).toBe(86000);
  });

  it("Coro é combinado", () => {
    expect(valorDoPlano(5, "unlimited")).toBeNull();
    expect(valorDoPlano(31, "max")).toBeNull();
  });

  it("nunca cobra abaixo do uso: pacientes acima do teto sobem o plano efetivo", () => {
    expect(planoEfetivo("pro", 15).id).toBe("max");
    expect(planoEfetivo("max", 3).id).toBe("max");
    expect(valorDoPlano(15, "pro")).toBe(valorDoPlano(15, "max"));
  });

  it("teto para cadastrar: o 11º paciente no Sussurro pede para subir de plano", () => {
    expect(cabeMaisUmPaciente("pro", 9)).toBe(true);
    expect(cabeMaisUmPaciente("pro", 10)).toBe(false);
    expect(cabeMaisUmPaciente("max", 29)).toBe(true);
    expect(cabeMaisUmPaciente("max", 30)).toBe(false);
    expect(cabeMaisUmPaciente("unlimited", 500)).toBe(true);
  });
});
