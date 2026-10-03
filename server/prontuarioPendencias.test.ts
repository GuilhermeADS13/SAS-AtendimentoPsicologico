import { describe, expect, it } from "vitest";
import { pendenciasDoProntuario } from "../shared/prontuario";

/**
 * A regra do "prontuário incompleto" (CFP 001/2009) é a mesma na Luma e na lista
 * de pacientes. Fica num lugar só (shared/prontuario.ts) e é fixada aqui.
 */
describe("pendências do prontuário (CFP 001/2009)", () => {
  it("lista tudo que falta, na ordem em que a Luma fala", () => {
    expect(pendenciasDoProntuario({})).toEqual([
      "avaliação da demanda inicial",
      "objetivos terapêuticos",
      "TCLE assinado",
      "ficha de anamnese",
    ]);
  });

  it("texto só com espaços conta como vazio", () => {
    expect(pendenciasDoProntuario({ initialDemand: "   ", therapeuticGoals: "\n" })).toContain("avaliação da demanda inicial");
  });

  it("prontuário completo não tem pendência", () => {
    expect(
      pendenciasDoProntuario({
        initialDemand: "Ansiedade no trabalho",
        therapeuticGoals: "Reduzir crises",
        tcleSignedAt: new Date(),
        anamnesis: { queixa: "x" },
      }),
    ).toEqual([]);
  });
});
