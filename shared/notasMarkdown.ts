/**
 * Edição de texto da barra de anotações (títulos, negrito, listas, citação...).
 *
 * Fica aqui, separado da tela, porque é lógica de texto pura — dá para testar sem
 * navegador, e era justamente onde moravam os erros: a lista só marcava a primeira
 * linha e nunca desmarcava, e nada disso tinha teste.
 */

export type Edicao = { texto: string; inicio: number; fim: number };

export type TipoDeLista = "marcador" | "numerada" | "tarefa";

/** Qualquer marcador de item no começo da linha: "- ", "1. ", "- [ ] ". */
const MARCADOR = /^(\s*)(?:[-*] \[[ xX]\] |[-*] |\d+\. )/;

const marcadorDe = (tipo: TipoDeLista, indice: number) =>
  tipo === "numerada" ? `${indice + 1}. ` : tipo === "tarefa" ? "- [ ] " : "- ";

const temMarcadorDe = (linha: string, tipo: TipoDeLista) =>
  tipo === "numerada" ? /^\s*\d+\. /.test(linha)
  : tipo === "tarefa" ? /^\s*[-*] \[[ xX]\] /.test(linha)
  : /^\s*[-*] (?!\[[ xX]\] )/.test(linha);

/** As linhas inteiras que a seleção toca (uma lista nunca se marca pela metade). */
function blocoDaSelecao(texto: string, inicio: number, fim: number) {
  const inicioLinha = texto.lastIndexOf("\n", Math.max(0, inicio - 1)) + 1;
  const quebra = texto.indexOf("\n", fim);
  const fimLinha = quebra === -1 ? texto.length : quebra;
  return { inicioLinha, fimLinha, bloco: texto.slice(inicioLinha, fimLinha) };
}

function trocarBloco(texto: string, inicioLinha: number, fimLinha: number, novoBloco: string): Edicao {
  const diferenca = novoBloco.length - (fimLinha - inicioLinha);
  return {
    texto: texto.slice(0, inicioLinha) + novoBloco + texto.slice(fimLinha),
    inicio: inicioLinha,
    fim: fimLinha + diferenca,
  };
}

/**
 * Negrito, itálico e tachado. ALTERNA: se a seleção já está marcada, tira a marca
 * em vez de empilhar outra (clicar duas vezes em B deixava `****texto****`).
 */
export function alternarMarca(texto: string, inicio: number, fim: number, marca: string): Edicao {
  const selecionado = texto.slice(inicio, fim);

  if (selecionado.length >= marca.length * 2 && selecionado.startsWith(marca) && selecionado.endsWith(marca)) {
    const limpo = selecionado.slice(marca.length, -marca.length);
    return { texto: texto.slice(0, inicio) + limpo + texto.slice(fim), inicio, fim: inicio + limpo.length };
  }

  const antes = texto.slice(Math.max(0, inicio - marca.length), inicio);
  const depois = texto.slice(fim, fim + marca.length);
  if (antes === marca && depois === marca) {
    const novoInicio = inicio - marca.length;
    return {
      texto: texto.slice(0, novoInicio) + selecionado + texto.slice(fim + marca.length),
      inicio: novoInicio,
      fim: novoInicio + selecionado.length,
    };
  }

  // Sem seleção, deixa o cursor PRONTO para digitar no meio das marcas.
  if (!selecionado) {
    return { texto: texto.slice(0, inicio) + marca + marca + texto.slice(inicio), inicio: inicio + marca.length, fim: inicio + marca.length };
  }

  return {
    texto: texto.slice(0, inicio) + marca + selecionado + marca + texto.slice(fim),
    inicio: inicio + marca.length,
    fim: fim + marca.length,
  };
}

/**
 * Listas (marcador, numerada e de tarefas). Pega TODAS as linhas da seleção
 * (antes marcava só a primeira) e alterna: se todas já são daquele tipo, remove.
 * Trocar de tipo converte, em vez de empilhar marcadores.
 */
export function alternarLista(texto: string, inicio: number, fim: number, tipo: TipoDeLista = "marcador"): Edicao {
  const { inicioLinha, fimLinha, bloco } = blocoDaSelecao(texto, inicio, fim);
  const linhas = bloco.split("\n");

  // Só "desmarca" se houver item de verdade: com o texto vazio, `every` dava
  // verdadeiro no nada e o botão tirava uma marca que não existia — ou seja, não
  // acontecia nada ao clicar.
  const comTexto = linhas.filter((l) => l.trim() !== "");
  const todasSaoDoTipo = comTexto.length > 0 && comTexto.every((l) => temMarcadorDe(l, tipo));

  let n = 0;
  const novoBloco = linhas
    .map((linha) => {
      const semMarcador = linha.replace(MARCADOR, "$1");
      if (todasSaoDoTipo) return semMarcador;
      if (semMarcador.trim() === "" && linhas.length > 1) return semMarcador;
      return marcadorDe(tipo, n++) + semMarcador;
    })
    .join("\n");

  return trocarBloco(texto, inicioLinha, fimLinha, novoBloco);
}

/**
 * Prefixo de linha que não é lista: título (`## `) e citação (`> `). Também
 * alterna, e troca um pelo outro em vez de somar os dois.
 */
export function alternarPrefixo(texto: string, inicio: number, fim: number, prefixo: string): Edicao {
  const { inicioLinha, fimLinha, bloco } = blocoDaSelecao(texto, inicio, fim);
  const linhas = bloco.split("\n");
  const outrosPrefixos = /^(\s*)(?:#{1,6} |> )/;

  const comTexto = linhas.filter((l) => l.trim() !== "");
  const todasTem = comTexto.length > 0 && comTexto.every((l) => l.trimStart().startsWith(prefixo));

  const novoBloco = linhas
    .map((linha) => {
      const limpa = linha.replace(outrosPrefixos, "$1");
      return todasTem ? limpa : prefixo + limpa;
    })
    .join("\n");

  return trocarBloco(texto, inicioLinha, fimLinha, novoBloco);
}

/**
 * Enter dentro de uma lista continua a lista, como no Word e no Notion: o item
 * seguinte já nasce marcado, e numa lista numerada o número avança. Enter num
 * item VAZIO encerra a lista (em vez de criar marcadores vazios sem fim).
 *
 * Devolve `null` quando a linha não é item — aí o Enter é o normal do navegador.
 */
export function continuarLista(texto: string, posicao: number): Edicao | null {
  const inicioLinha = texto.lastIndexOf("\n", Math.max(0, posicao - 1)) + 1;
  const linha = texto.slice(inicioLinha, posicao);
  const m = linha.match(/^(\s*)([-*] \[[ xX]\] |[-*] |\d+\. |> )/);
  if (!m) return null;

  const [, recuo, marcador] = m;
  const conteudo = linha.slice(m[0].length);

  // Item vazio: encerra a lista, limpando a linha.
  if (conteudo.trim() === "") {
    return { texto: texto.slice(0, inicioLinha) + texto.slice(posicao), inicio: inicioLinha, fim: inicioLinha };
  }

  const numero = marcador.match(/^(\d+)\. /);
  // A caixa do próximo item nasce desmarcada, mesmo que a de cima esteja marcada.
  const proximo = numero
    ? `${Number(numero[1]) + 1}. `
    : marcador.replace(/\[[xX]\]/, "[ ]");
  const inserir = `\n${recuo}${proximo}`;
  return {
    texto: texto.slice(0, posicao) + inserir + texto.slice(posicao),
    inicio: posicao + inserir.length,
    fim: posicao + inserir.length,
  };
}

/**
 * Insere um modelo (SOAP, evolução...) no FIM da anotação, separado por uma linha
 * em branco, e devolve o cursor no primeiro campo vazio do modelo — era preciso
 * caçar onde digitar depois de inserir.
 */
export function inserirModelo(texto: string, modelo: string): Edicao {
  const base = texto.trim() ? `${texto.replace(/\s*$/, "")}\n\n` : "";
  const completo = base + modelo;
  const posicaoDoCursor = completo.indexOf("\n\n", base.length);
  const caret = posicaoDoCursor === -1 ? completo.length : posicaoDoCursor + 2;
  return { texto: completo, inicio: caret, fim: caret };
}

/**
 * O menor trecho que mudou entre dois textos.
 *
 * Serve para aplicar a edição com `insertText` em vez de reescrever o campo
 * inteiro: assim o DESFAZER do navegador (Ctrl+Z) continua funcionando depois de
 * usar a barra, como no Word.
 */
export function diffMinimo(antigo: string, novo: string): { de: number; ate: number; texto: string } {
  let i = 0;
  while (i < antigo.length && i < novo.length && antigo[i] === novo[i]) i++;
  let j = 0;
  while (j < antigo.length - i && j < novo.length - i && antigo[antigo.length - 1 - j] === novo[novo.length - 1 - j]) j++;
  return { de: i, ate: antigo.length - j, texto: novo.slice(i, novo.length - j) };
}
