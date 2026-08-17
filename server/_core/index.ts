import "./loadEnv"; // DEVE ser o primeiro import (carrega .env antes de env.ts)
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerPresence } from "../presence";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getDocumentQueueMetrics, queueMetricsToPrometheus } from "../ai/queue-metrics";
import { agentRuntimeMetricsToPrometheus } from "../ai/runtime-metrics";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // WebSocket de presença das salas (avisa a psicóloga quando o paciente entra).
  registerPresence(server);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Rotas do Manus removidas: /api/oauth/callback (login paralelo forjável) e
  // /manus-storage/* (proxy de storage nunca configurado). Ver context.ts.
  app.get("/metrics", async (req, res) => {
    const metricsToken = process.env.PROMETHEUS_METRICS_TOKEN;
    // Fail-CLOSED: sem o token configurado (o caso padrão no Render), /metrics NÃO
    // é público — antes o `if (metricsToken && ...)` pulava a checagem quando a
    // variável estava vazia, expondo profundidade de fila, contadores de
    // erro/segurança e latência a qualquer um. Agora exige o token sempre.
    if (!metricsToken || req.get("authorization") !== `Bearer ${metricsToken}`) {
      res.status(metricsToken ? 401 : 404).type("text/plain").send(metricsToken ? "unauthorized\n" : "not found\n");
      return;
    }
    try {
      const queueMetrics = await getDocumentQueueMetrics();
      res.type("text/plain; version=0.0.4").send(
        `${queueMetricsToPrometheus(queueMetrics)}${agentRuntimeMetricsToPrometheus()}`,
      );
    } catch (error) {
      console.error("[Metrics] falha ao coletar métricas", error instanceof Error ? error.message : "unknown_error");
      res.status(503).type("text/plain").send("metrics_unavailable 1\n");
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });

  // Agendador de lembretes/notificações (opt-in). Enfileira e envia os e-mails
  // pendentes a cada 15 min. Ative com NOTIFICATIONS_ENABLED=true + SMTP_*.
  if (process.env.NOTIFICATIONS_ENABLED === "true") {
    const runCycle = async () => {
      try {
        const {
          sendAppointmentReminders,
          sendTherapistAlerts,
          sendCancellationAlerts,
          processPendingNotifications,
          notifyPendingTherapistRequests,
        } = await import("../notifications");
        await sendAppointmentReminders();
        await sendTherapistAlerts();
        await sendCancellationAlerts();
        // Reenvia o aviso de solicitação de acesso que não saiu na hora.
        const pedidos = await notifyPendingTherapistRequests();
        const result = await processPendingNotifications();
        console.log("[Notifications] ciclo:", { ...result, solicitacoes: pedidos });
      } catch (error) {
        console.error("[Notifications] erro no ciclo:", error);
      }
    };
    setInterval(runCycle, 15 * 60 * 1000);
    void runCycle();
  }
}

startServer().catch(console.error);
