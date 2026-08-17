import { describe, expect, it } from "vitest";
import {
  aiMaintenanceMessage,
  areClinicalToolsEnabled,
  isAiAgentEnabled,
  isAiRagEnabled,
} from "./ai/runtime-config";

describe("configuração operacional da Luma", () => {
  it("mantém o agente habilitado por padrão e permite kill switch", () => {
    expect(isAiAgentEnabled({})).toBe(true);
    expect(isAiAgentEnabled({ AI_AGENT_ENABLED: "false" })).toBe(false);
    expect(aiMaintenanceMessage()).toContain("modo de manutenção");
  });

  it("permite desligar RAG e ferramentas independentemente", () => {
    expect(isAiRagEnabled({ AI_RAG_ENABLED: "false" })).toBe(false);
    expect(areClinicalToolsEnabled({ AI_CLINICAL_TOOLS_ENABLED: "false" })).toBe(false);
    expect(isAiRagEnabled({})).toBe(true);
    expect(areClinicalToolsEnabled({})).toBe(true);
  });
});
