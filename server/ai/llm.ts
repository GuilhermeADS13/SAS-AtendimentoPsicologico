import { ChatOpenAI } from "@langchain/openai";

export type OpenSourceChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenSourceLlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
};

/**
 * Configuração para qualquer servidor que implemente a API OpenAI:
 * Ollama, vLLM, LM Studio, LiteLLM ou um gateway compatível.
 */
export function getOpenSourceLlmConfig(env: NodeJS.ProcessEnv = process.env): OpenSourceLlmConfig {
  return {
    baseUrl: env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    apiKey: env.LLM_API_KEY ?? "ollama",
    model: env.LLM_MODEL ?? "qwen3:8b",
    temperature: Number(env.LLM_TEMPERATURE ?? "0.2"),
    maxTokens: Number(env.LLM_MAX_TOKENS ?? "800"),
  };
}

export function createOpenSourceChatModel(config = getOpenSourceLlmConfig()) {
  return new ChatOpenAI({
    model: config.model,
    apiKey: config.apiKey,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    configuration: {
      baseURL: config.baseUrl,
    },
  });
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

export async function generateOpenSourceReply(
  messages: OpenSourceChatMessage[],
  config = getOpenSourceLlmConfig(),
): Promise<{ content: string; model: string }> {
  if (!messages.some(message => message.role === "user")) {
    throw new Error("A conversa precisa conter uma mensagem do usuário");
  }

  const model = createOpenSourceChatModel(config);
  const response = await model.invoke(
    messages.map(message => [message.role, message.content] as const),
  );
  const content = contentToText(response.content).trim();

  if (!content) throw new Error("O modelo não retornou conteúdo");
  return { content, model: config.model };
}
