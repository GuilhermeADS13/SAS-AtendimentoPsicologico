/**
 * Edição de texto da barra de anotações (negrito, itálico, lista e modelos).
 *
 * Fica aqui, separado da tela, porque é lógica de texto pura — dá para testar sem
 * navegador, e era justamente onde moravam os erros: a lista só marcava a primeira
 * linha e nunca desmarcava, e nada disso tinha teste.
 */

export type Edicao = { texto: string; inicio: number; fim: number };

/**
 * Negrito/itálico. ALTERNA: se a seleção já está marcada, tira a marca em vez de
 * empilhar outra (clicar duas vezes em B deixava `****texto****`).
 */
export function alternarMarca(texto: string, inicio: number, fim: number, marca: string): Edicao {
  const selecionado = texto.slice(inicio, fim);

  // Já marcado por dentro da seleção: **isto**
  if (selecionado.length >= marca.length * 2 && selecionado.startsWith(marca) && selecionado.endsWith(marca)) {
    const limpo = selecionado.slice(marca.length, -marca.length);
    return { texto: texto.slice(0, inicio) + limpo + texto.slice(fim), inicio, fim: inicio + limpo.length };
  }

  // Já marcado por fora da seleção: **[isto]**
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
 * Lista. Pega TODAS as linhas da seleção (antes marcava só a primeira) e alterna:
 * se todas já são itens, remove o "- ".
 */
export function alternarLista(texto: string, inicio: number, fim: number): Edicao {
  const inicioLinha = texto.lastIndexOf("\n", Math.max(0, inicio - 1)) + 1;
  const quebraDepois = texto.indexOf("\n", fim);
  const fimLinha = quebraDepois === -1 ? texto.length : quebraDepois;

  const bloco = texto.slice(inicioLinha, fimLinha);
  const linhas = bloco.split("\n");
  // Só "desmarca" se houver item de verdade: com o texto vazio, `every` dava
  // verdadeiro no nada e o botão tirava uma marca que não existia — ou seja, não
  // acontecia nada ao clicar.
  const comTexto = linhas.filter((l) => l.trim() !== "");
  const todasSaoItens = comTexto.length > 0 && comTexto.every((l) => /^\s*- /.test(l));
  const novoBloco = linhas
    .map((l) => (todasSaoItens ? l.replace(/^(\s*)- /, "$1") : l.trim() === "" ? "- " : `- ${l}`))
    .join("\n");

  const diferenca = novoBloco.length - bloco.length;
  return {
    texto: texto.slice(0, inicioLinha) + novoBloco + texto.slice(fimLinha),
    inicio: inicioLinha,
    fim: fimLinha + diferenca,
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
  // Primeira linha em branco DEPOIS de um título do modelo: é onde se escreve.
  const posicaoDoCursor = completo.indexOf("\n\n", base.length);
  const caret = posicaoDoCursor === -1 ? completo.length : posicaoDoCursor + 2;
  return { texto: completo, inicio: caret, fim: caret };
}
