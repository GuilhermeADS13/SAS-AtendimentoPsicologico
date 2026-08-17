import { describe, expect, it } from "vitest";
import {
  aiAuditEvents,
  aiConversations,
  aiMemories,
  aiMessages,
} from "../drizzle/schema";

describe("modelo de dados do agente de IA", () => {
  it("mantém identidade e escopo clínico explícitos nas conversas", () => {
    expect(aiConversations.userId).toBeDefined();
    expect(aiConversations.therapistId).toBeDefined();
    expect(aiConversations.patientId).toBeDefined();
    expect(aiConversations.retentionExpiresAt).toBeDefined();
    expect(aiConversations.status).toBeDefined();
  });

  it("mantém o histórico ordenável e identificável por conversa", () => {
    expect(aiMessages.conversationId).toBeDefined();
    expect(aiMessages.role).toBeDefined();
    expect(aiMessages.content).toBeDefined();
    expect(aiMessages.contentRedacted).toBeDefined();
    expect(aiMessages.createdAt).toBeDefined();
  });

  it("mantém memória com escopo, expiração e ciclo de vida", () => {
    expect(aiMemories.userId).toBeDefined();
    expect(aiMemories.scope).toBeDefined();
    expect(aiMemories.memoryType).toBeDefined();
    expect(aiMemories.status).toBeDefined();
    expect(aiMemories.expiresAt).toBeDefined();
    expect(aiMemories.sourceConversationId).toBeDefined();
  });

  it("mantém auditoria separada do conteúdo integral das mensagens", () => {
    expect(aiAuditEvents.userId).toBeDefined();
    expect(aiAuditEvents.action).toBeDefined();
    expect(aiAuditEvents.conversationId).toBeDefined();
    expect(aiAuditEvents.metadata).toBeDefined();
    expect(aiAuditEvents).not.toHaveProperty("content");
  });
});
