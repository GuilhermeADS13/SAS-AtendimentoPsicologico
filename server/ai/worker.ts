import { processNextDocumentJob } from "./document-queue";
import { getDocumentQueueMetrics, logQueueAlerts } from "./queue-metrics";

const POLL_INTERVAL_MS = Number(process.env.AI_WORKER_POLL_INTERVAL_MS ?? 3000);
const ONCE = process.env.AI_WORKER_ONCE === "1";
const METRICS_INTERVAL_MS = Number(process.env.AI_WORKER_METRICS_INTERVAL_MS ?? 60000);
let lastMetricsAt = 0;

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  do {
    try {
      if (Date.now() - lastMetricsAt >= METRICS_INTERVAL_MS) {
        const metrics = await getDocumentQueueMetrics();
        console.info(JSON.stringify({ event: "ai_queue_metrics", ...metrics }));
        logQueueAlerts(metrics);
        lastMetricsAt = Date.now();
      }
      const job = await processNextDocumentJob();
      if (!job) await sleep(POLL_INTERVAL_MS);
      else console.info(`[ai-worker] documento ${job.documentId} processado no job ${job.id}`);
    } catch (error) {
      console.error("[ai-worker] falha ao processar job; o retry será controlado pela fila", error);
      if (!ONCE) await sleep(POLL_INTERVAL_MS);
    }
  } while (!ONCE);
}

void main().catch(error => {
  console.error("[ai-worker] encerrado com erro fatal", error);
  process.exitCode = 1;
});
