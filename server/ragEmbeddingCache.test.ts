import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { embeddingForCurrentEnvironment, limparCacheDeEmbeddings } from "./ai/rag";

/**
 * O índice vetorial é remontado a CADA pergunta, e `escolherCandidatos` traz até
 * 70 sessões e 40 documentos. Sem cache, isso são ~110 chamadas ao provedor por
 * pergunta — e o mesmo texto clínico reenviado para fora toda vez. O texto de uma
 * sessão só muda quando a psicóloga a edita, então o vetor pode ser reaproveitado.
 */
describe("cache de embeddings", () => {
  const vetor = Array.from({ length: 768 }, (_, i) => i / 768);
  let chamadas = 0;

  beforeEach(() => {
    limparCacheDeEmbeddings();
    chamadas = 0;
    process.env.LLM_EMBEDDING_BASE_URL = "https://exemplo.invalido/v1";
    process.env.LLM_EMBEDDING_API_KEY = "chave-de-teste";
    process.env.LLM_EMBEDDING_MODEL = "modelo-de-teste";
    vi.stubGlobal("fetch", async () => {
      chamadas += 1;
      return { ok: true, json: async () => ({ data: [{ embedding: vetor }] }) } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    limparCacheDeEmbeddings();
  });

  it("chama o provedor uma vez e reaproveita nas repetições", async () => {
    const embedding = embeddingForCurrentEnvironment();
    const texto = "Notas clínicas: relatou insônia na semana";

    const primeiro = await embedding.getTextEmbedding(texto);
    const segundo = await embedding.getTextEmbedding(texto);
    const terceiro = await embedding.getTextEmbedding(texto);

    expect(chamadas).toBe(1);
    expect(segundo).toEqual(primeiro);
    expect(terceiro).toEqual(primeiro);
  });

  it("texto diferente continua indo ao provedor", async () => {
    const embedding = embeddingForCurrentEnvironment();
    await embedding.getTextEmbedding("primeira sessão");
    await embedding.getTextEmbedding("segunda sessão");
    expect(chamadas).toBe(2);
  });

  /**
   * A chave inclui o modelo. Trocar o modelo de embedding (ex.: para um
   * multilíngue) precisa invalidar o cache sozinho — comparar vetor novo com
   * vetor velho daria resultado errado SEM erro nenhum.
   */
  it("trocar o modelo invalida o cache", async () => {
    const texto = "mesma frase";
    await embeddingForCurrentEnvironment().getTextEmbedding(texto);
    expect(chamadas).toBe(1);

    process.env.LLM_EMBEDDING_MODEL = "outro-modelo";
    await embeddingForCurrentEnvironment().getTextEmbedding(texto);
    expect(chamadas).toBe(2);
  });
});
