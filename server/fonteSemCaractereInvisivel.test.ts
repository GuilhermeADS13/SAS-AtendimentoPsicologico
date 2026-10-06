import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RAIZ, acharCaracteresDeControle, varrer } from "../scripts/caractereInvisivel";

/**
 * Segunda barreira contra o caractere invisível. A primeira é o hook de
 * pre-commit (.githooks/pre-commit), que impede o commit; esta aqui pega o que
 * passou por `--no-verify`, veio de outra máquina sem o hook instalado, ou entrou
 * antes de tudo isso existir — e roda no CI.
 *
 * Usa o MESMO varredor do hook de propósito: duas implementações da mesma regra
 * divergem com o tempo, e aí uma barreira passa a dizer que está tudo bem
 * enquanto a outra reprova.
 */
const PASTAS = ["server", "shared", "client/src", "scripts"];
const EXTENSOES = [".ts", ".tsx", ".js", ".jsx", ".css", ".sql", ".yml", ".md"];

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

describe("o varredor de caractere invisível", () => {
  it("acha o BACKSPACE que um \\b vira quando escrito por heredoc", () => {
    const comArmadilha = `const padrao = /\\${String.fromCharCode(8)}teste/;`;
    const achados = acharCaracteresDeControle(comArmadilha, "exemplo.ts");
    expect(achados).toHaveLength(1);
    expect(achados[0].codigo).toBe(8);
    expect(achados[0].linha).toBe(1);
  });

  it("aponta a linha certa quando o caractere está no meio do arquivo", () => {
    const conteudo = ["linha boa", "outra linha", `regex /${String.fromCharCode(8)}ai/`].join("\n");
    expect(acharCaracteresDeControle(conteudo)[0].linha).toBe(3);
  });

  it("não reclama de tab, LF nem CR, que são legítimos", () => {
    expect(acharCaracteresDeControle("a\tb\r\nc\nd")).toEqual([]);
  });

  it("aceita acento e emoji sem falso positivo", () => {
    expect(acharCaracteresDeControle("avaliação — ansiedade 🦉 João")).toEqual([]);
  });
});

describe("nenhum caractere invisível no código-fonte", () => {
  const arquivos = PASTAS.flatMap(arquivosFonte);

  it("encontra arquivos para varrer (senão o teste passaria à toa)", () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("não há caractere de controle em nenhum arquivo", () => {
    const achados = varrer(arquivos).map(a => `${a.arquivo}:${a.linha}:${a.coluna} (codepoint ${a.codigo})`);
    expect(achados).toEqual([]);
  });
});
