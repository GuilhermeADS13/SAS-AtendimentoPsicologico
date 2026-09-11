import { describe, expect, it } from "vitest";
import { getLlmProviders, deveTentarProximoProvedor } from "./ai/llm";

/**
 * Failover de provedores: quando a Groq estoura o rate limit (8000 tokens/min no
 * free), o agente cai para o próximo provedor. Aqui garantimos que a cadeia é
 * montada certo e que só falhas "de provedor" (rate limit, 5xx, conexão) acionam
 * o próximo — um 400/401 (problema da nossa requisição) não.
 */
describe("getLlmProviders", () => {
  const principal = {
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_API_KEY: "chave-groq",
    LLM_MODEL: "openai/gpt-oss-120b",
  } as NodeJS.ProcessEnv;

  it("sem backups configurados, devolve só o principal", () => {
    const p = getLlmProviders(principal);
    expect(p).toHaveLength(1);
    expect(p[0].model).toBe("openai/gpt-oss-120b");
  });

  it("inclui os backups numerados, na ordem", () => {
    const p = getLlmProviders({
      ...principal,
      LLM_FALLBACK_1_BASE_URL: "https://api.cerebras.ai/v1",
      LLM_FALLBACK_1_API_KEY: "chave-cerebras",
      LLM_FALLBACK_1_MODEL: "gpt-oss-120b",
      LLM_FALLBACK_2_BASE_URL: "https://openrouter.ai/api/v1",
      LLM_FALLBACK_2_API_KEY: "chave-or",
      LLM_FALLBACK_2_MODEL: "meta-llama/llama-3.1-70b",
    } as NodeJS.ProcessEnv);
    expect(p.map(x => x.model)).toEqual([
      "openai/gpt-oss-120b",
      "gpt-oss-120b",
      "meta-llama/llama-3.1-70b",
    ]);
    expect(p[1].baseUrl).toBe("https://api.cerebras.ai/v1");
  });

  it("ignora um backup incompleto (falta a chave)", () => {
    const p = getLlmProviders({
      ...principal,
      LLM_FALLBACK_1_BASE_URL: "https://api.cerebras.ai/v1",
      LLM_FALLBACK_1_MODEL: "gpt-oss-120b",
      // sem LLM_FALLBACK_1_API_KEY
    } as NodeJS.ProcessEnv);
    expect(p).toHaveLength(1);
  });
});

describe("deveTentarProximoProvedor", () => {
  it("cai para o próximo em rate limit e sobrecarga", () => {
    expect(deveTentarProximoProvedor({ status: 429 })).toBe(true);
    expect(deveTentarProximoProvedor({ status: 503 })).toBe(true);
    expect(deveTentarProximoProvedor(new Error("429 Rate limit reached ... tokens per minute (TPM)"))).toBe(true);
    expect(deveTentarProximoProvedor(new Error("fetch failed: ECONNRESET"))).toBe(true);
  });

  it("NÃO cai para o próximo em erro da nossa requisição", () => {
    expect(deveTentarProximoProvedor({ status: 400 })).toBe(false);
    expect(deveTentarProximoProvedor({ status: 401 })).toBe(false);
    expect(deveTentarProximoProvedor(new Error("model does not exist"))).toBe(false);
  });
});
