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
  },
});
