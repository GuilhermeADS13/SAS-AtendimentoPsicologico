import { describe, expect, it } from "vitest";
import { problemaDeConfiguracaoDeEmbedding } from "./ai/rag";

/**
 * A armadilha real que isto cobre: sem LLM_EMBEDDING_BASE_URL, os embeddings caem
 * no LLM_BASE_URL — que em produção é o Groq, e o Groq não tem /embeddings. Antes,
 * isso virava um 404 no meio da conversa e a Luma "morria" sem explicação.
 */
describe("configuração do provedor de embeddings", () => {
  it("acusa o fallback para o Groq, que não serve embeddings", () => {
    const problema = problemaDeConfiguracaoDeEmbedding({
      LLM_BASE_URL: "https://api.groq.com/openai/v1",
    } as NodeJS.ProcessEnv);
    expect(problema).toContain("LLM_EMBEDDING_BASE_URL");
    expect(problema).toContain("Groq");
  });

  it("não reclama quando o provedor de embeddings está configurado", () => {
    expect(
      problemaDeConfiguracaoDeEmbedding({
        LLM_BASE_URL: "https://api.groq.com/openai/v1",
        LLM_EMBEDDING_BASE_URL: "https://api.cloudflare.com/client/v4/accounts/x/ai/v1",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("ignora espaço/CRLF em volta do valor (env importado no Windows)", () => {
    expect(
      problemaDeConfiguracaoDeEmbedding({
        LLM_BASE_URL: "https://api.groq.com/openai/v1",
        LLM_EMBEDDING_BASE_URL: "  https://api.cloudflare.com/client/v4/accounts/x/ai/v1\r",
      } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it("não reclama de provedores que servem embeddings (ex.: Ollama local)", () => {
    expect(
      problemaDeConfiguracaoDeEmbedding({ LLM_BASE_URL: "http://localhost:11434/v1" } as NodeJS.ProcessEnv),
    ).toBeNull();
    expect(problemaDeConfiguracaoDeEmbedding({} as NodeJS.ProcessEnv)).toBeNull();
  });
});
