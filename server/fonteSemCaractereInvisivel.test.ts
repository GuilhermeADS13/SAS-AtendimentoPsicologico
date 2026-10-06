import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Nenhum arquivo-fonte pode conter caractere de controle.
 *
 * Isto já aconteceu DUAS vezes neste projeto, as duas com a mesma mecânica: um
 * script gerando código escreveu `\b` dentro de uma expressão regular e o que foi
 * parar no arquivo não foi a borda de palavra, e sim o caractere BACKSPACE
 * (codepoint 8). O arquivo compila, o typecheck passa, o editor não mostra nada —
 * e a expressão simplesmente nunca casa com o que deveria.
 *
 * Da primeira vez a proteção cobriu só `ai/llm.ts`, o arquivo da ocorrência. Na
 * segunda o caractere caiu em `_core/index.ts` e passou batido. Por isso aqui a
 * varredura é da árvore inteira: a defesa não pode ficar presa ao local do último
 * acidente.
 *
 * Tab (9), LF (10) e CR (13) são legítimos.
 */
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTAS = ["server", "shared", "client/src"];
const EXTENSOES = [".ts", ".tsx", ".js", ".jsx", ".css"];

function arquivosFonte(pasta: string): string[] {
  const encontrados: string[] = [];
  const percorrer = (caminho: string) => {
    for (const item of readdirSync(caminho)) {
      if (item === "node_modules" || item.startsWith(".")) continue;
      const completo = join(caminho, item);
      if (statSync(completo).isDirectory()) percorrer(completo);
      else if (EXTENSOES.some(ext => item.endsWith(ext))) encontrados.push(completo);
    }
  };
  percorrer(join(RAIZ, pasta));
  return encontrados;
}

describe("nenhum caractere invisível no código-fonte", () => {
  const arquivos = PASTAS.flatMap(arquivosFonte);

  it("encontra arquivos para varrer (senão o teste passaria à toa)", () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("não há caractere de controle em nenhum arquivo", () => {
    const culpados: string[] = [];
    for (const arquivo of arquivos) {
      const fonte = readFileSync(arquivo, "utf8");
      const linhas = fonte.split("\n");
      linhas.forEach((linha, i) => {
        for (const c of linha) {
          const cp = c.charCodeAt(0);
          if (cp < 32 && cp !== 9 && cp !== 13) {
            culpados.push(`${arquivo.slice(RAIZ.length)}:${i + 1} tem o caractere ${cp}`);
            break;
          }
        }
      });
    }
    expect(culpados).toEqual([]);
  });
});
