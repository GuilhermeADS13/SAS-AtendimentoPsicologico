import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { htmlComMetadados, urlBase } from "../paginaHtml";
import { rotaExiste } from "../../shared/paginasDoSite";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      template = htmlComMetadados(template, url, urlBase(req));
      const page = await vite.transformIndexHtml(url, template);
      res.status(rotaExiste(url) ? 200 : 404).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  // index: false — senão o express.static responderia "/" com o index.html cru,
  // sem o título e a prévia de compartilhamento da página inicial.
  app.use(express.static(distPath, { index: false }));

  // Toda página é o mesmo index.html (SPA), com o título e a prévia de cada uma
  // (server/paginaHtml.ts). Endereço que não existe sai com 404 de verdade: com
  // 200, o Google indexava qualquer URL inventada como uma cópia da inicial.
  let indexHtml: string | null = null;
  app.use("*", (req, res) => {
    indexHtml ??= fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8");
    res
      .status(rotaExiste(req.originalUrl) ? 200 : 404)
      .set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" })
      .send(htmlComMetadados(indexHtml, req.originalUrl, urlBase(req)));
  });
}
