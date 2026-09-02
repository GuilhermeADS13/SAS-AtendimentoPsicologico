import { defineConfig, devices } from "@playwright/test";

/**
 * E2E_BASE_URL aponta os testes para um ambiente JÁ PUBLICADO (produção, por
 * exemplo) em vez de subir o servidor local. Existe porque o `pnpm dev` usa o
 * .env.local, que aponta para o banco de PRODUÇÃO — subir servidor só para testar
 * significaria escrever no banco real. Com a variável definida, nenhum servidor
 * local é iniciado.
 */
const baseExterna = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: baseExterna ?? "http://127.0.0.1:3100",
    headless: true,
    launchOptions: {
      // Sem env, usa o Chromium que o próprio Playwright instala.
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  // Com E2E_BASE_URL definida, testa o ambiente publicado e não sobe nada local.
  webServer: baseExterna
    ? undefined
    : {
        command: "VITE_E2E=true PORT=3100 pnpm dev",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
