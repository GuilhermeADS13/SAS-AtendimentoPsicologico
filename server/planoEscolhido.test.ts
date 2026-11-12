import { describe, expect, it } from "vitest";
import { cabeMaisUmPaciente, planoEfetivo, planoPorId, valorDoPlano } from "../shared/precos";
import { limitesDoPlano } from "./assinaturas";

// Plano escolhido "como a Netflix": ela escolhe um plano da tabela, ganha os bônus
// na hora e paga o PREÇO FIXO do plano (decisão de 2026-10-27; faixas de 2026-11-12).
describe("plano escolhido", () => {
  it("dentro do limite, o valor não muda com o número de pacientes", () => {
    expect(valorDoPlano(1, "pro")).toBe(3100);
    expect(valorDoPlano(2, "pro")).toBe(3100);
    expect(valorDoPlano(11, "pro")).toBe(3100);
    expect(valorDoPlano(12, "max")).toBe(8100);
    expect(valorDoPlano(22, "max")).toBe(8100);
    expect(valorDoPlano(33, "canto")).toBe(15100);
    expect(valorDoPlano(44, "coro")).toBe(24100);
  });

  it("Sussurro sem nenhum paciente: R$ 0 (a cobrança começa no 1º)", () => {
    expect(valorDoPlano(0, "pro")).toBe(0);
  });

  it("plano maior escolhido cedo, pelos bônus: paga por ele mesmo com poucos pacientes", () => {
    expect(valorDoPlano(5, "max")).toBe(8100);
    expect(valorDoPlano(0, "max")).toBe(8100);
    expect(valorDoPlano(5, "canto")).toBe(15100);
  });

  it("Fundadora e anual valem por cima do preço fixo", () => {
    expect(valorDoPlano(5, "max", { fundador: true })).toBe(6480);
    expect(valorDoPlano(5, "max", { fundador: true, ciclo: "anual" })).toBe(64800);
    expect(valorDoPlano(40, "coro", { fundador: true })).toBe(19280);
  });

  it("Sob medida é combinado", () => {
    expect(valorDoPlano(5, "unlimited")).toBeNull();
    expect(valorDoPlano(45, "coro")).toBeNull();
  });

  it("Sob medida: vale o valor combinado (sem desconto por cima); anual = 10x", () => {
    expect(valorDoPlano(50, "unlimited", { combinado: 30000 })).toBe(30000);
    expect(valorDoPlano(50, "unlimited", { combinado: 30000, fundador: true })).toBe(30000);
    expect(valorDoPlano(50, "unlimited", { combinado: 30000, ciclo: "anual" })).toBe(300000);
  });

  it("valor combinado só vale no Sob medida (decisão de 2026-10-27)", () => {
    expect(valorDoPlano(5, "pro", { combinado: 1 })).toBe(3100);
    expect(valorDoPlano(5, "coro", { combinado: 1 })).toBe(24100);
  });

  it("Luma e anexo combinados só no Sob medida; sem nada combinado, os do Coro", () => {
    const sm = { lumaPorDia: 40, anexoMb: 20 };
    expect(limitesDoPlano(planoPorId("unlimited"), sm)).toEqual({ lumaPorDia: 40, anexoMb: 20 });
    expect(limitesDoPlano(planoPorId("unlimited"), null)).toEqual({ lumaPorDia: 25, anexoMb: 20 });
    expect(limitesDoPlano(planoPorId("coro"), sm)).toEqual({ lumaPorDia: 25, anexoMb: 20 });
    expect(limitesDoPlano(planoPorId("canto"), sm)).toEqual({ lumaPorDia: 20, anexoMb: 15 });
    expect(limitesDoPlano(planoPorId("max"), sm)).toEqual({ lumaPorDia: 15, anexoMb: 10 });
    expect(limitesDoPlano(planoPorId("pro"), sm)).toEqual({ lumaPorDia: 5, anexoMb: 5 });
  });

  it("nunca cobra abaixo do uso: pacientes acima do teto sobem o plano efetivo", () => {
    expect(planoEfetivo("pro", 15).id).toBe("max");
    expect(planoEfetivo("pro", 25).id).toBe("canto");
    expect(planoEfetivo("max", 3).id).toBe("max");
    expect(valorDoPlano(15, "pro")).toBe(8100);
  });

  it("teto para cadastrar: o 12º paciente no Sussurro pede para subir de plano", () => {
    expect(cabeMaisUmPaciente("pro", 10)).toBe(true);
    expect(cabeMaisUmPaciente("pro", 11)).toBe(false);
    expect(cabeMaisUmPaciente("max", 21)).toBe(true);
    expect(cabeMaisUmPaciente("max", 22)).toBe(false);
    expect(cabeMaisUmPaciente("coro", 44)).toBe(false);
    expect(cabeMaisUmPaciente("unlimited", 500)).toBe(true);
  });
});
