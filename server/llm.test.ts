import { describe, expect, it } from "vitest";
import { getOpenSourceLlmConfig } from "./ai/llm";

describe("configuração do LLM open source", () => {
  it("usa defaults compatíveis com Ollama local", () => {
    expect(getOpenSourceLlmConfig({})).toEqual({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "ollama",
      model: "qwen3:8b",
      temperature: 0.2,
      maxTokens: 800,
    });
  });

  it("permite apontar para vLLM, LM Studio ou LiteLLM", () => {
    expect(getOpenSourceLlmConfig({
      LLM_BASE_URL: "https://llm.internal/v1",
      LLM_API_KEY: "secret",
      LLM_MODEL: "Qwen/Qwen3-8B",
      LLM_TEMPERATURE: "0.1",
      LLM_MAX_TOKENS: "1200",
    })).toEqual({
      baseUrl: "https://llm.internal/v1",
      apiKey: "secret",
      model: "Qwen/Qwen3-8B",
      temperature: 0.1,
      maxTokens: 1200,
    });
  });
});
