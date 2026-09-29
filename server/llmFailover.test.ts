import { describe, expect, it } from "vitest";
import { getLlmProviders, deveTentarProximoProvedor } from "./ai/llm";

/**
 * Failover de provedores: quando a Groq estoura o rate limit (8000 tokens/min no
 * free), o agente cai para o próximo provedor. Aqui garantimos que a cadeia é
 * montada certo e que só falhas "de provedor" (rate limit, 5xx, conexão) acionam
 * o próximo — um 400/401 (problema da nossa requisição) não.
 */
/**
 * O provedor so entra na cadeia com BASE_URL + chave + MODEL. Faltando qualquer uma,
 * ele e descartado EM SILENCIO — sem erro, sem log — e tudo parece configurado. Foi
 * o que aconteceu em 2026-09-29: a chave existia no painel do Render com o nome
 * curto (LLM_FALLBACK_2) e o failover simplesmente nao tinha aquele provedor.
 */
describe("nome da variavel da chave de fallback", () => {
  const trio = {
    LLM_FALLBACK_1_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_FALLBACK_1_MODEL: "openai/gpt-oss-120b",
  };

  it("aceita o nome padrao LLM_FALLBACK_1_API_KEY", () => {
    const p = getLlmProviders({ ...trio, LLM_FALLBACK_1_API_KEY: "chave-padrao" } as NodeJS.ProcessEnv);
    expect(p).toHaveLength(2);
    expect(p[1].apiKey).toBe("chave-padrao");
  });

  it("aceita tambem o nome curto LLM_FALLBACK_1", () => {
    const p = getLlmProviders({ ...trio, LLM_FALLBACK_1: "chave-curta" } as NodeJS.ProcessEnv);
    expect(p).toHaveLength(2);
    expect(p[1].apiKey).toBe("chave-curta");
  });

  it("o nome padrao vence quando os dois existem", () => {
    const p = getLlmProviders({ ...trio, LLM_FALLBACK_1_API_KEY: "padrao", LLM_FALLBACK_1: "curta" } as NodeJS.ProcessEnv);
    expect(p[1].apiKey).toBe("padrao");
  });

  it("sem BASE_URL ou sem MODEL o provedor NAO entra (mesmo com a chave)", () => {
    expect(getLlmProviders({ LLM_FALLBACK_1: "so-a-chave" } as NodeJS.ProcessEnv)).toHaveLength(1);
    expect(getLlmProviders({
      LLM_FALLBACK_1_BASE_URL: trio.LLM_FALLBACK_1_BASE_URL,
      LLM_FALLBACK_1: "sem-modelo",
    } as NodeJS.ProcessEnv)).toHaveLength(1);
  });
});

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
