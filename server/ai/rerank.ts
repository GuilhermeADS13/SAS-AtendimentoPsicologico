import type { RagSource } from "./rag";

const SOURCE_WEIGHT: Record<RagSource["sourceType"], number> = {
  document: 1,
  session: 0.98,
  patient: 0.92,
};

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLocaleLowerCase("pt-BR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 4),
  );
}

export function rerankClinicalSources(sources: RagSource[], query: string, topK = 5): RagSource[] {
  const queryTokens = tokenize(query);
  return sources
    .map((source, index) => {
      const sourceTokens = tokenize(source.text);
      const overlap = Array.from(queryTokens).filter(token => sourceTokens.has(token)).length;
      const lexicalScore = queryTokens.size ? overlap / queryTokens.size : 0;
      const similarityScore = source.score == null ? 0 : Math.max(0, Math.min(1, 1 - source.score));
      const score = (similarityScore * 0.65) + (lexicalScore * 0.25) + (SOURCE_WEIGHT[source.sourceType] * 0.1);
      return { source: { ...source, score }, score, index };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Math.min(topK, 8)))
    .map(item => item.source);
}
