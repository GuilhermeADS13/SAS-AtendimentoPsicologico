import { describe, expect, it } from "vitest";
import { sessionText } from "./ai/rag";

/**
 * O texto indexado da sessão é o que a busca da Luma consegue alcançar. O que não
 * entra aqui simplesmente não existe para ela — sem erro, sem aviso.
 *
 * A evolução SOAP ficava INTEIRA de fora: é onde a psicóloga escreve a análise da
 * sessão, então "o que eu avaliei sobre o sono dele?" não encontrava nada, mesmo
 * com a resposta registrada no campo Avaliação.
 */
const sessao = {
  startedAt: new Date("2026-03-04T14:00:00.000Z"),
  mood: "ansioso",
  clinicalNotes: "relatou insônia na semana",
  treatment: "respiração diafragmática",
  nextSteps: "diário de sono",
  subjective: "diz que acorda às 3h e não volta a dormir",
  objective: "olheiras marcadas, fala acelerada",
  assessment: "insônia de manutenção ligada à ruminação noturna",
  plan: "higiene do sono e reestruturação cognitiva",
} as unknown as Parameters<typeof sessionText>[0];

describe("texto da sessão indexado para a busca", () => {
  it.each([
    ["Subjetivo", "acorda às 3h"],
    ["Objetivo", "olheiras marcadas"],
    ["Avaliação", "insônia de manutenção"],
    ["Plano", "higiene do sono"],
  ])("inclui o campo SOAP %s", (_campo, trecho) => {
    expect(sessionText(sessao)).toContain(trecho);
  });

  it("mantém os campos que já entravam", () => {
    const texto = sessionText(sessao);
    for (const trecho of ["ansioso", "insônia na semana", "respiração diafragmática", "diário de sono"]) {
      expect(texto).toContain(trecho);
    }
  });

  /** Sessão com SOAP em branco não pode gerar rótulo solto poluindo o contexto. */
  it("omite o que está vazio", () => {
    const texto = sessionText({
      startedAt: new Date("2026-03-04T14:00:00.000Z"),
      mood: null,
      clinicalNotes: null,
      treatment: null,
      nextSteps: null,
      subjective: null,
      objective: null,
      assessment: null,
      plan: null,
    } as unknown as Parameters<typeof sessionText>[0]);
    expect(texto).toBe("Sessão realizada em 2026-03-04T14:00:00.000Z");
  });
});
