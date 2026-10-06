#!/usr/bin/env tsx
/**
 * Caça caractere de controle no código-fonte.
 *
 * POR QUE ISTO EXISTE
 *
 * Já aconteceu três vezes neste projeto, sempre do mesmo jeito: alguém edita um
 * arquivo por script (heredoc de shell, python, sed) e escreve `\b` dentro de uma
 * expressão regular. Num literal de string NÃO-cru, `"\b"` não é a borda de
 * palavra — é o caractere BACKSPACE, codepoint 8. O que vai para o arquivo é esse
 * byte invisível.
 *
 * O estrago é silencioso em todas as camadas: o arquivo compila, o typecheck
 * passa, o editor não desenha nada, a revisão não vê. A expressão simplesmente
 * nunca casa com o que deveria — e num detector de crise ou de intenção isso é um
 * bug grave que ninguém percebe.
 *
 * COMO EVITAR NA ORIGEM: não escreva conteúdo com barra invertida por heredoc.
 * Use um editor de arquivo (que grava o texto literal) ou, se precisar de script,
 * um literal CRU (`r"..."` no Python) — e rode este verificador depois.
 *
 * Tab (9), LF (10) e CR (13) são legítimos e passam.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const RAIZ = resolve(import.meta.dirname, "..");
const PASTAS = ["server", "shared", "client/src", "scripts", "e2e"];
const EXTENSOES = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".json", ".sql", ".yml", ".yaml", ".md"];

export type Ocorrencia = { arquivo: string; linha: number; coluna: number; codigo: number };

const ehFonte = (caminho: string) => EXTENSOES.some(ext => caminho.endsWith(ext));

/** Varre um texto. Separado do disco para o teste poder exercitar sem arquivo. */
export function acharCaracteresDeControle(conteudo: string, arquivo = "(memória)"): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  conteudo.split("\n").forEach((linha, i) => {
    [...linha].forEach((c, j) => {
      const codigo = c.charCodeAt(0);
      // \r sobrevive ao split("\n") em arquivo CRLF: é legítimo.
      if (codigo < 32 && codigo !== 9 && codigo !== 13) {
        achados.push({ arquivo, linha: i + 1, coluna: j + 1, codigo });
      }
    });
  });
  return achados;
}

function todosOsArquivos(): string[] {
  const encontrados: string[] = [];
  const percorrer = (caminho: string) => {
    for (const item of readdirSync(caminho)) {
      if (item === "node_modules" || item.startsWith(".")) continue;
      const completo = join(caminho, item);
      if (statSync(completo).isDirectory()) percorrer(completo);
      else if (ehFonte(item)) encontrados.push(completo);
    }
  };
  for (const pasta of PASTAS) {
    try {
      percorrer(join(RAIZ, pasta));
    } catch {
      /* pasta opcional (ex.: e2e pode não existir) */
    }
  }
  return encontrados;
}

/** Só o que está em staging — é o que o hook de pre-commit precisa olhar. */
function arquivosEmStaging(): string[] {
  const saida = execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACM"], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  return saida
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && ehFonte(l))
    .map(l => join(RAIZ, l));
}

export function varrer(arquivos: string[]): Ocorrencia[] {
  return arquivos.flatMap(arquivo => {
    let conteudo: string;
    try {
      conteudo = readFileSync(arquivo, "utf8");
    } catch {
      return []; // arquivo removido entre o git diff e a leitura
    }
    return acharCaracteresDeControle(conteudo, relative(RAIZ, arquivo));
  });
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const executadoDiretamente = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename);
if (executadoDiretamente) {
  const soStaging = process.argv.includes("--staged");
  const arquivos = soStaging ? arquivosEmStaging() : todosOsArquivos();
  const achados = varrer(arquivos);

  if (achados.length === 0) {
    if (!soStaging) console.log(`sem caractere de controle em ${arquivos.length} arquivos`);
    process.exit(0);
  }

  console.error("\nCARACTERE DE CONTROLE INVISÍVEL ENCONTRADO:\n");
  for (const a of achados) {
    console.error(`  ${a.arquivo}:${a.linha}:${a.coluna} — codepoint ${a.codigo}${a.codigo === 8 ? " (BACKSPACE, quase sempre um \\b que virou byte)" : ""}`);
  }
  console.error(
    "\nIsto compila, passa no typecheck e é invisível no editor — e a expressão regular\n" +
      "onde ele caiu nunca casa com o que deveria.\n\n" +
      "Causa quase certa: o arquivo foi escrito por heredoc/sed com `\\b` num literal\n" +
      "não-cru. Reescreva o trecho por um editor de arquivo, ou use literal cru.\n",
  );
  process.exit(1);
}
