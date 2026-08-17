type RuntimeMetrics = {
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  safetyIntercepts: number;
  killSwitchHits: number;
  totalDurationMs: number;
};

const metrics: RuntimeMetrics = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  safetyIntercepts: 0,
  killSwitchHits: 0,
  totalDurationMs: 0,
};

export function recordAgentRequest(durationMs: number, outcome: "success" | "error" | "cache_hit"): void {
  metrics.requests += 1;
  metrics.totalDurationMs += Math.max(0, durationMs);
  if (outcome === "cache_hit") metrics.cacheHits += 1;
  if (outcome === "error") metrics.errors += 1;
}

export function recordAgentCacheMiss(): void {
  metrics.cacheMisses += 1;
}

export function recordAgentSafetyIntercept(): void {
  metrics.safetyIntercepts += 1;
}

export function recordAgentKillSwitch(): void {
  metrics.killSwitchHits += 1;
}

export function agentRuntimeMetricsToPrometheus(): string {
  const averageDuration = metrics.requests > 0 ? metrics.totalDurationMs / metrics.requests : 0;
  return [
    `ai_agent_requests_total ${metrics.requests}`,
    `ai_agent_cache_hits_total ${metrics.cacheHits}`,
    `ai_agent_cache_misses_total ${metrics.cacheMisses}`,
    `ai_agent_errors_total ${metrics.errors}`,
    `ai_agent_safety_intercepts_total ${metrics.safetyIntercepts}`,
    `ai_agent_kill_switch_hits_total ${metrics.killSwitchHits}`,
    `ai_agent_request_duration_ms_sum ${metrics.totalDurationMs}`,
    `ai_agent_request_duration_ms_avg ${averageDuration}`,
  ].join("\n") + "\n";
}

export function resetAgentRuntimeMetrics(): void {
  metrics.requests = 0;
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.errors = 0;
  metrics.safetyIntercepts = 0;
  metrics.killSwitchHits = 0;
  metrics.totalDurationMs = 0;
}
