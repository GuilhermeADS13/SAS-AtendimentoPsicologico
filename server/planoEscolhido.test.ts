import { describe, expect, it } from "vitest";
import { cabeMaisUmPaciente, planoEfetivo, planoPorId, valorDoPlano } from "../shared/precos";
import { limitesDoPlano } from "./assinaturas";

// Plano escolhido "como a Netflix": ela escolhe Sussurro ou Voz, ganha os bônus
// na hora e paga o PREÇO FIXO do plano (decisão de 2026-10-27).
describe("plano escolhido", () => {
  it("dentro do limite, o valor não muda com o número de pacientes", () => {
    expect(valorDoPlano(1, "pro")).toBe(3900);
    expect(valorDoPlano(2, "pro")).toBe(3900);
    expect(valorDoPlano(10, "pro")).toBe(3900);
    expect(valorDoPlano(11, "max")).toBe(8900);
    expect(valorDoPlano(30, "max")).toBe(8900);
  });

  it("Sussurro sem nenhum paciente: R$ 0 (a cobrança começa no 1º)", () => {
    expect(valorDoPlano(0, "pro")).toBe(0);
  });

  it("Voz escolhido cedo, pelos bônus: paga o Voz mesmo com poucos pacientes", () => {
    expect(valorDoPlano(5, "max")).toBe(8900);
    expect(valorDoPlano(0, "max")).toBe(8900);
  });

  it("Fundadora e anual valem por cima do preço fixo", () => {
    expect(valorDoPlano(5, "max", { fundador: true })).toBe(7120);
    expect(valorDoPlano(5, "max", { fundador: true, ciclo: "anual" })).toBe(71200);
  });

  it("Coro é combinado", () => {
    expect(valorDoPlano(5, "unlimited")).toBeNull();
    expect(valorDoPlano(31, "max")).toBeNull();
  });

  it("Coro sob medida: vale o valor combinado (sem desconto por cima); anual = 10x", () => {
    expect(valorDoPlano(40, "unlimited", { combinado: 25000 })).toBe(25000);
    expect(valorDoPlano(40, "unlimited", { combinado: 25000, fundador: true })).toBe(25000);
    expect(valorDoPlano(40, "unlimited", { combinado: 25000, ciclo: "anual" })).toBe(250000);
  });

  it("valor combinado só vale no Coro (decisão de 2026-10-27)", () => {
    expect(valorDoPlano(5, "pro", { combinado: 1 })).toBe(3900);
    expect(valorDoPlano(5, "max", { combinado: 1 })).toBe(8900);
  });

  it("Luma e anexo sob medida só no Coro; sem nada combinado, o do Voz", () => {
    const sm = { lumaPorDia: 40, anexoMb: 20 };
    expect(limitesDoPlano(planoPorId("unlimited"), sm)).toEqual({ lumaPorDia: 40, anexoMb: 20 });
    expect(limitesDoPlano(planoPorId("unlimited"), null)).toEqual({ lumaPorDia: 15, anexoMb: 10 });
    expect(limitesDoPlano(planoPorId("max"), sm)).toEqual({ lumaPorDia: 15, anexoMb: 10 });
    expect(limitesDoPlano(planoPorId("pro"), sm)).toEqual({ lumaPorDia: 5, anexoMb: 5 });
  });

  it("nunca cobra abaixo do uso: pacientes acima do teto sobem o plano efetivo", () => {
    expect(planoEfetivo("pro", 15).id).toBe("max");
    expect(planoEfetivo("max", 3).id).toBe("max");
    expect(valorDoPlano(15, "pro")).toBe(8900);
  });

  it("teto para cadastrar: o 11º paciente no Sussurro pede para subir de plano", () => {
    expect(cabeMaisUmPaciente("pro", 9)).toBe(true);
    expect(cabeMaisUmPaciente("pro", 10)).toBe(false);
    expect(cabeMaisUmPaciente("max", 29)).toBe(true);
    expect(cabeMaisUmPaciente("max", 30)).toBe(false);
    expect(cabeMaisUmPaciente("unlimited", 500)).toBe(true);
  });
});
