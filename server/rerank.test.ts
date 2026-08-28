import { describe, expect, it } from "vitest";
import { rerankClinicalSources } from "./ai/rerank";

const source = (sourceType: "patient" | "session" | "document", sourceId: number, text: string, score?: number) => ({
  sourceType,
  sourceId,
  patientId: 42,
  text,
  score,
  requiresReview: false,
});

describe("reranking do contexto clínico", () => {
  it("prioriza similaridade e correspondência lexical", () => {
    const ranked = rerankClinicalSources([
      source("patient", 1, "dados gerais", 0.31),
      source("document", 2, "ansiedade e sono registrados", 0.88),
    ], "ansiedade sono", 5);
    expect(ranked[0]?.sourceId).toBe(2);
  });

  // Regressão: `source.score` é SIMILARIDADE (maior = melhor), não distância.
  // A versão anterior calculava `1 - score` e ordenava o contexto clínico ao
  // contrário. Este caso isola o sinal: mesmo texto, só o score muda.
  it("trata score como similaridade — maior score vem primeiro", () => {
    const ranked = rerankClinicalSources([
      source("session", 1, "texto identico para isolar o score", 0.20),
      source("session", 2, "texto identico para isolar o score", 0.95),
    ], "consulta sem sobreposicao lexical", 5);
    expect(ranked.map(item => item.sourceId)).toEqual([2, 1]);
  });

  it("mantém limite máximo e não cria fontes novas", () => {
    const sources = Array.from({ length: 10 }, (_, index) => source("session", index, `sessão ${index}`, 0.2));
    const ranked = rerankClinicalSources(sources, "sessão", 20);
    expect(ranked).toHaveLength(8);
    expect(ranked.every(item => sources.some(source => source.sourceId === item.sourceId))).toBe(true);
  });
});
