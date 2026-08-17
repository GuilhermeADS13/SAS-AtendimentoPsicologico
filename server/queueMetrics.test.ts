import { afterEach, describe, expect, it, vi } from "vitest";
import { logQueueAlerts, queueMetricsToPrometheus, type DocumentQueueMetrics } from "./ai/queue-metrics";

const baseMetrics: DocumentQueueMetrics = {
  pending: 2,
  processing: 1,
  indexed: 10,
  failed: 0,
  backlog: 3,
  oldestPendingAt: null,
  oldestProcessingAt: null,
  oldestPendingAgeSeconds: 120,
  generatedAt: "2026-08-17T00:00:00.000Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AI_QUEUE_ALERT_MAX_AGE_SECONDS;
  delete process.env.AI_QUEUE_ALERT_MAX_FAILED;
});

describe("queue metrics", () => {
  it("serializes counts and backlog as Prometheus metrics", () => {
    const output = queueMetricsToPrometheus(baseMetrics);
    expect(output).toContain('ai_document_jobs{status="pending"} 2');
    expect(output).toContain('ai_document_jobs{status="processing"} 1');
    expect(output).toContain("ai_document_queue_backlog 3");
    expect(output).toContain("ai_document_queue_oldest_pending_age_seconds 120");
  });

  it("emits alerts only when queue thresholds are exceeded", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.AI_QUEUE_ALERT_MAX_AGE_SECONDS = "60";
    process.env.AI_QUEUE_ALERT_MAX_FAILED = "1";

    logQueueAlerts({ ...baseMetrics, failed: 2, oldestPendingAgeSeconds: 90 });

    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls.map(([entry]) => String(entry)).join(" ")).toContain("ai_queue_backlog_alert");
    expect(error.mock.calls.map(([entry]) => String(entry)).join(" ")).toContain("ai_queue_failed_alert");
  });
});
