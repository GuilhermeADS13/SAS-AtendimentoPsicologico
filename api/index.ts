// Função serverless da Vercel: expõe a API (tRPC + OAuth) como um app Express.
// A Vercel roda isto sob demanda para cada request em /api/* (ver vercel.json).
// O frontend é servido estaticamente (dist/public) — não há servidor persistente,
// por isso o WebSocket de presença não roda aqui (degrada para o polling do sininho).
import "../server/_core/loadEnv";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../server/routers";
import { createContext } from "../server/_core/context";
import { registerOAuthRoutes } from "../server/_core/oauth";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

registerOAuthRoutes(app);

app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default app;
