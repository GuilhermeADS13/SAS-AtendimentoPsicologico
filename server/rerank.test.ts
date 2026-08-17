import { describe, expect, it } from "vitest";
import { rerankClinicalSources } from "./ai/rerank";

const source = (sourceType: "patient" | "session" | "document", sourceId: number, text: string, score?: number) => ({
  sourceType,
  sourceId,
  patientId: 42,
  text,
  score,
});

describe("reranking do contexto clínico", () => {
  it("prioriza similaridade e correspondência lexical", () => {
    const ranked = rerankClinicalSources([
      source("patient", 1, "dados gerais", 0.7),
      source("document", 2, "ansiedade e sono registrados", 0.12),
    ], "ansiedade sono", 5);
    expect(ranked[0]?.sourceId).toBe(2);
  });

  it("mantém limite máximo e não cria fontes novas", () => {
    const sources = Array.from({ length: 10 }, (_, index) => source("session", index, `sessão ${index}`, 0.2));
    const ranked = rerankClinicalSources(sources, "sessão", 20);
    expect(ranked).toHaveLength(8);
    expect(ranked.every(item => sources.some(source => source.sourceId === item.sourceId))).toBe(true);
  });
});
