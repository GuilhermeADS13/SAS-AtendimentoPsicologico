import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Document, Settings, VectorStoreIndex } from "llamaindex";
import { embeddingForCurrentEnvironment, limparCacheDeEmbeddings, prefixosDoModelo } from "./ai/rag";

/**
 * O EmbeddingGemma foi treinado com prefixos DIFERENTES para a busca e para o
 * documento. Num teste com anotações clínicas fictícias em português, sem os
 * prefixos ele errava justamente "risco de autolesão"; com eles, acertava todas.
 *
 * O risco aqui é silencioso: se a pergunta saísse sem prefixo, ou com o prefixo
 * de documento, a busca continuaria "funcionando" — só pior, sem erro nenhum.
 * Por isso estes testes gravam o texto EXATO que chega ao provedor.
 */
describe("prefixos de tarefa do modelo de embedding", () => {
  const enviados: string[] = [];

  beforeEach(() => {
    limparCacheDeEmbeddings();
    enviados.length = 0;
    process.env.LLM_EMBEDDING_BASE_URL = "https://exemplo.invalido/v1";
    process.env.LLM_EMBEDDING_API_KEY = "chave-de-teste";
    vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
      const { input } = JSON.parse(init.body) as { input: string };
      enviados.push(input);
      // Vetor determinístico qualquer: aqui só interessa O QUE foi enviado.
      const vetor = Array.from({ length: 8 }, (_, i) => ((input.length + i) % 7) / 7);
      return { ok: true, json: async () => ({ data: [{ embedding: vetor }] }) } as unknown as Response;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    limparCacheDeEmbeddings();
  });

  it("o EmbeddingGemma tem prefixo de busca e de documento, e eles diferem", () => {
    const p = prefixosDoModelo("@cf/google/embeddinggemma-300m");
    expect(p.busca).toBe("task: search result | query: ");
    expect(p.documento).toBe("title: none | text: ");
  });

  /** Aplicar o prefixo do Gemma num modelo que não o espera só seria ruído. */
  it("outro modelo não recebe prefixo nenhum", () => {
    expect(prefixosDoModelo("@cf/baai/bge-base-en-v1.5")).toEqual({ busca: "", documento: "" });
  });

  it("documento vai com o prefixo de documento", async () => {
    process.env.LLM_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
    await embeddingForCurrentEnvironment().getTextEmbedding("relatou insônia");
    expect(enviados).toEqual(["title: none | text: relatou insônia"]);
  });

  it("a pergunta vai com o prefixo de busca", async () => {
    process.env.LLM_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
    await embeddingForCurrentEnvironment().getQueryEmbedding({ type: "text", text: "dificuldade para dormir" });
    expect(enviados).toEqual(["task: search result | query: dificuldade para dormir"]);
  });

  /**
   * O caminho REAL da busca de sessões: a LlamaIndex monta o índice dentro de
   * Settings.withEmbedModel e só depois busca, FORA dele. Este teste prova que,
   * mesmo assim, a pergunta passa pelo getQueryEmbedding desta classe — com o
   * prefixo de busca — e os documentos pelo de documento.
   */
  it("na busca real da LlamaIndex, documentos e pergunta recebem cada um o seu prefixo", async () => {
    process.env.LLM_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
    const modelo = embeddingForCurrentEnvironment();
    const index = await Settings.withEmbedModel(modelo, () =>
      VectorStoreIndex.fromDocuments([
        new Document({ text: "crise de ansiedade no metrô" }),
        new Document({ text: "luto pela perda do avô" }),
      ]),
    );
    await index.asRetriever({ similarityTopK: 1 }).retrieve("ataque de pânico no trem");

    const documentos = enviados.filter((t) => t.startsWith("title: none | text: "));
    const buscas = enviados.filter((t) => t.startsWith("task: search result | query: "));
    expect(documentos).toHaveLength(2);
    expect(buscas).toEqual(["task: search result | query: ataque de pânico no trem"]);
    // Nada saiu sem prefixo.
    expect(enviados.every((t) => t.startsWith("title: ") || t.startsWith("task: "))).toBe(true);
  });

  /** A mesma frase como busca e como documento são vetores DIFERENTES — o cache não pode misturar. */
  it("busca e documento do mesmo texto não se confundem no cache", async () => {
    process.env.LLM_EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";
    const modelo = embeddingForCurrentEnvironment();
    await modelo.getTextEmbedding("insônia");
    await modelo.getQueryEmbedding({ type: "text", text: "insônia" });
    expect(enviados).toHaveLength(2);
  });
});
