import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Roda no fuso dos usuários (Brasil). Sem isso, numa máquina/CI em UTC os
    // testes de data passariam trivialmente — o bug de fuso (nascimento um dia
    // atrás, e-mail com horário errado) só aparece em fuso negativo.
    env: { TZ: "America/Sao_Paulo" },
    // `pnpm test:coverage` (o CI usa): mede o que os testes executam no servidor e
    // no código compartilhado. Os pisos ficam logo abaixo do medido em 04/11/2026:
    // um teste apagado, ou código novo sem teste, derruba o CI. Ao subir a
    // cobertura, suba o piso junto.
    coverage: {
      provider: "v8",
      include: ["server/**", "shared/**"],
      exclude: ["**/*.test.ts", "**/*.spec.ts"],
      reporter: ["text-summary"],
      thresholds: { lines: 47, statements: 47, functions: 72, branches: 83 },
    },
  },
});
