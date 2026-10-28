import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// O runtime do Manus é ferramenta de EDIÇÃO (seletor de elemento, screenshot) e o
// plugin não tem trava de produção: ele injeta o runtime INLINE no index.html em
// todo build, o que deixava o HTML de produção com 360 KB (358 KB só desse script,
// um React inteiro embutido). Como o HTML não fica em cache, isso era baixado a
// cada visita. `apply: "serve"` mantém a ferramenta no dev e tira do build.
const manusRuntimeApenasNoDev: Plugin = { ...vitePluginManusRuntime(), apply: "serve" };

// O jsx-loc carimba cada elemento com `data-loc="client\src\pages\X.tsx:42"` para o
// seletor do Manus. Em produção isso só expunha a estrutura do código (e pesava no
// bundle); fica no dev, junto do runtime que o usa.
const jsxLocApenasNoDev: Plugin = { ...jsxLocPlugin(), apply: "serve" };

const plugins = [react(), tailwindcss(), jsxLocApenasNoDev, manusRuntimeApenasNoDev];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
