import { describe, expect, it, beforeEach } from "vitest";
import { buildAgentCacheKey, clearAgentResponseCache, getCachedAgentResponse, setCachedAgentResponse } from "./ai/response-cache";
import { prepareMessagesForAgent } from "./ai/llm";

describe("cache e otimização do agente", () => {
  beforeEach(() => clearAgentResponseCache());

  it("isola a chave por paciente e terapeuta", () => {
    const messages = [{ role: "user", content: "Qual é o próximo passo?" }];
    const first = buildAgentCacheKey({ userId: 1, role: "therapist", therapistId: 7, patientId: 10, model: "qwen", temperature: 0.2 }, messages);
    const second = buildAgentCacheKey({ userId: 1, role: "therapist", therapistId: 7, patientId: 11, model: "qwen", temperature: 0.2 }, messages);
    expect(first).not.toBe(second);
  });

  it("armazena e recupera somente quando o cache está habilitado", () => {
    const env = { AI_RESPONSE_CACHE_ENABLED: "true", AI_RESPONSE_CACHE_TTL_SECONDS: "60", AI_RESPONSE_CACHE_MAX_ENTRIES: "10" };
    setAgentResponse("key", { content: "resposta", model: "qwen" }, env);
    expect(getCachedAgentResponse("key", env)).toEqual({ content: "resposta", model: "qwen" });
    expect(getCachedAgentResponse("key", { ...env, AI_RESPONSE_CACHE_ENABLED: "false" })).toBeUndefined();
  });

  it("mantém a primeira pergunta e as mensagens mais recentes dentro do orçamento", () => {
    const messages = [
      { role: "user" as const, content: "pergunta inicial" },
      ...Array.from({ length: 10 }, (_, index) => ({ role: "assistant" as const, content: `mensagem ${index}` })),
      { role: "user" as const, content: "pergunta atual" },
    ];
    const prepared = prepareMessagesForAgent(messages, {
      AI_AGENT_MAX_HISTORY_MESSAGES: "3",
      AI_AGENT_MAX_MESSAGE_CHARS: "100",
      AI_AGENT_MAX_CONTEXT_CHARS: "1000",
    });
    expect(prepared[0]?.content).toBe("pergunta inicial");
    expect(prepared.at(-1)?.content).toBe("pergunta atual");
    expect(prepared.length).toBeLessThanOrEqual(4);
  });
});

function setAgentResponse(key: string, value: { content: string; model: string }, env: NodeJS.ProcessEnv): void {
  setCachedAgentResponse(key, value, env);
}
