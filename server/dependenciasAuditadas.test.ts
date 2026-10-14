import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Exceções do `pnpm audit` (package.json → pnpm.auditConfig.ignoreGhsas) só valem
 * enquanto a justificativa for verdadeira. Este teste é a justificativa.
 */
describe("exceções de auditoria de dependências", () => {
  /**
   * GHSA-hp3w-g68c-fv3c (sprintf-js, DoS): não existe versão corrigida (vale até
   * a 1.1.3, a mais nova). Ele entra por mammoth → argparse → sprintf-js, e o
   * argparse só é usado pelo PROGRAMA DE TERMINAL do mammoth (bin/mammoth). O
   * servidor usa só a biblioteca (extractRawText), que nunca o carrega.
   * Se um dia a biblioteca passar a usar o argparse, a exceção deixa de valer —
   * e este teste falha, para alguém reavaliar.
   */
  it("a biblioteca do mammoth (o que o servidor usa) não carrega argparse", () => {
    const require = createRequire(import.meta.url);
    const pasta = path.dirname(require.resolve("mammoth"));
    const arquivos: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = path.join(dir, nome);
        if (statSync(p).isDirectory()) varrer(p);
        else if (nome.endsWith(".js")) arquivos.push(p);
      }
    };
    varrer(pasta);
    expect(arquivos.length).toBeGreaterThan(10);
    const comArgparse = arquivos.filter((a) => readFileSync(a, "utf8").includes("argparse"));
    expect(comArgparse).toEqual([]);
  });

  it("a exceção registrada é só essa", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.pnpm.auditConfig.ignoreGhsas).toEqual(["GHSA-hp3w-g68c-fv3c"]);
  });
});
