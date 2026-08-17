import { createHash } from "node:crypto";

export type AgentCacheScope = {
  userId: number;
  role: string;
  therapistId?: number;
  patientId?: number;
  model: string;
  temperature: number;
};

export type CachedAgentSource = {
  sourceType: "patient" | "session" | "document";
  sourceId: number;
  patientId: number;
  requiresReview: boolean;
};

export type CachedAgentResponse = {
  content: string;
  model: string;
  sources: CachedAgentSource[];
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  touchedAt: number;
};

export function normalizeCacheText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function buildAgentCacheKey(scope: AgentCacheScope, messages: Array<{ role: string; content: string }>): string {
  const payload = JSON.stringify({
    version: process.env.AI_CACHE_VERSION ?? "1",
    scope,
    messages: messages.map(message => ({ role: message.role, content: normalizeCacheText(message.content) })),
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function getAgentCacheConfig(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
} {
  return {
    enabled: env.AI_RESPONSE_CACHE_ENABLED === "true",
    ttlMs: Math.max(1_000, Number(env.AI_RESPONSE_CACHE_TTL_SECONDS ?? 60) * 1_000),
    maxEntries: Math.max(10, Number(env.AI_RESPONSE_CACHE_MAX_ENTRIES ?? 500)),
  };
}

class TtlLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    entry.touchedAt = now;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number, maxEntries: number, now = Date.now()): void {
    this.entries.set(key, { value, expiresAt: now + ttlMs, touchedAt: now });
    while (this.entries.size > maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

const responseCache = new TtlLruCache<CachedAgentResponse>();

export function getCachedAgentResponse(key: string, env: NodeJS.ProcessEnv = process.env): CachedAgentResponse | undefined {
  const config = getAgentCacheConfig(env);
  return config.enabled ? responseCache.get(key) : undefined;
}

export function setCachedAgentResponse(key: string, value: CachedAgentResponse, env: NodeJS.ProcessEnv = process.env): void {
  const config = getAgentCacheConfig(env);
  if (config.enabled) responseCache.set(key, value, config.ttlMs, config.maxEntries);
}

export function clearAgentResponseCache(): void {
  responseCache.clear();
}
