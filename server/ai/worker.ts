import { processNextDocumentJob } from "./document-queue";

const POLL_INTERVAL_MS = Number(process.env.AI_WORKER_POLL_INTERVAL_MS ?? 3000);
const ONCE = process.env.AI_WORKER_ONCE === "1";

async function sleep(ms: number) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  do {
    try {
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
