import { beforeEach, describe, expect, it } from "vitest";
import {
  agentRuntimeMetricsToPrometheus,
  recordAgentKillSwitch,
  recordAgentSafetyIntercept,
  resetAgentRuntimeMetrics,
} from "./ai/runtime-metrics";

describe("métricas operacionais da Luma", () => {
  beforeEach(() => resetAgentRuntimeMetrics());

  it("expõe interceptações de segurança sem dados clínicos", () => {
    recordAgentSafetyIntercept();
    const output = agentRuntimeMetricsToPrometheus();
    expect(output).toContain("ai_agent_safety_intercepts_total 1");
    expect(output).not.toMatch(/prompt|prontuário|paciente/i);
  });

  it("expõe acionamentos do kill switch", () => {
    recordAgentKillSwitch();
    expect(agentRuntimeMetricsToPrometheus()).toContain("ai_agent_kill_switch_hits_total 1");
  });
});
