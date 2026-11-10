import type { Celula } from "@shared/importarPacientes";
import { lerCsv } from "@shared/importarPacientes";

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

/**
 * Lê a primeira aba de um .xlsx, ou um .csv, como linhas de células.
 *
 * O .xlsx é um zip com XML dentro: o fflate (que já vinha com o jsPDF) abre o zip
 * e o DOMParser do navegador lê o XML. Evita uma biblioteca de Excel inteira para
 * o que aqui é só "nome, e-mail, telefone".
 */
export async function lerPlanilha(arquivo: File): Promise<{ linhas: Celula[][]; linhaDoCabecalho: number; data1904: boolean }> {
  const { linhas, data1904 } = await lerLinhas(arquivo);
  // O cabeçalho é a primeira linha com algo escrito; o número dela entra na prévia.
  let linhaDoCabecalho = 1;
  while (linhas.length && linhas[0].every((c) => c === null || String(c).trim() === "")) {
    linhas.shift();
    linhaDoCabecalho++;
  }
  return { linhas, linhaDoCabecalho, data1904 };
}

async function lerLinhas(arquivo: File): Promise<{ linhas: Celula[][]; data1904: boolean }> {
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error("Planilha grande demais (máximo de 5 MB).");
  const nome = arquivo.name.toLowerCase();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  if (nome.endsWith(".csv") || nome.endsWith(".txt")) return { linhas: lerCsv(decodificarTexto(bytes)), data1904: false };
  if (nome.endsWith(".xls")) {
    throw new Error("Esse é o formato antigo do Excel (.xls). No Excel, use “Salvar como” → “Pasta de Trabalho do Excel (.xlsx)” ou “CSV”.");
  }
  if (nome.endsWith(".xlsx")) return lerXlsx(bytes);
  throw new Error("Envie a planilha em .xlsx (Excel) ou .csv.");
}

/** CSV do Excel brasileiro costuma vir em Windows-1252, não UTF-8: tenta os dois. */
function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const xml = (texto: string) => new DOMParser().parseFromString(texto, "application/xml");
const tags = (no: Document | Element, nome: string) => Array.from(no.getElementsByTagNameNS("*", nome));

/** "C12" -> 2 (coluna A = 0). */
function indiceDaColuna(ref: string): number {
  const letras = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Linha mais baixa que ainda aceitamos ler: a importação vai até 500 pacientes. */
const ULTIMA_LINHA = 20_000;

async function lerXlsx(bytes: Uint8Array): Promise<{ linhas: Celula[][]; data1904: boolean }> {
  const { unzipSync, strFromU8 } = await import("fflate");
  let arquivos: Record<string, Uint8Array>;
  try {
    // Só o que interessa, e nada gigante descompactado (zip-bomba).
    arquivos = unzipSync(bytes, {
      filter: (f) => f.originalSize < 30 * 1024 * 1024 && /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(f.name),
    });
  } catch {
    throw new Error("Não deu para abrir a planilha. Confira se é um arquivo do Excel (.xlsx).");
  }
  const texto = (caminho: string) => (arquivos[caminho] ? strFromU8(arquivos[caminho]) : null);

  // Primeira aba: workbook.xml dá o id, o .rels dá o arquivo.
  const workbook = texto("xl/workbook.xml");
  const rels = texto("xl/_rels/workbook.xml.rels");
  let caminhoDaAba = "xl/worksheets/sheet1.xml";
  // Pasta com o sistema de data 1904 (Excel antigo de Mac): as datas contam de outro dia.
  const docDoWorkbook = workbook ? xml(workbook) : null;
  const pr = docDoWorkbook ? tags(docDoWorkbook, "workbookPr")[0] : undefined;
  const data1904 = /^(1|true)$/i.test(pr?.getAttribute("date1904") ?? "");
  if (docDoWorkbook && rels) {
    const primeira = tags(docDoWorkbook, "sheet")[0];
    const id = primeira?.getAttribute("r:id") ?? primeira?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = tags(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === id);
    const alvo = rel?.getAttribute("Target");
    if (alvo) caminhoDaAba = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
  }
  const aba = texto(caminhoDaAba);
  if (!aba) throw new Error("A planilha está vazia ou não é um arquivo do Excel (.xlsx).");

  // Textos repetidos ficam numa tabela à parte; a célula guarda só o índice.
  const compartilhados = texto("xl/sharedStrings.xml");
  const strings = compartilhados ? tags(xml(compartilhados), "si").map((si) => tags(si, "t").map((t) => t.textContent ?? "").join("")) : [];

  const linhas: Celula[][] = [];
  for (const row of tags(xml(aba), "row")) {
    const numero = Number(row.getAttribute("r")) || linhas.length + 1;
    const celulas: Celula[] = [];
    let colunaSemEndereco = 0;
    for (const c of tags(row, "c")) {
      const tipo = c.getAttribute("t");
      const v = tags(c, "v")[0]?.textContent ?? null;
      let valor: Celula = null;
      if (tipo === "s") valor = v === null ? null : strings[Number(v)] ?? null;
      else if (tipo === "inlineStr") valor = tags(c, "t").map((t) => t.textContent ?? "").join("");
      else if (tipo === "str") valor = v;
      else if (tipo === "b") valor = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (tipo === "e") valor = null;
      else valor = v === null || v === "" ? null : Number(v);
      // Sem o endereço ("B2"), a célula vem na ordem: alguns programas o omitem.
      const ref = c.getAttribute("r");
      const coluna = ref ? indiceDaColuna(ref) : colunaSemEndereco;
      colunaSemEndereco = coluna + 1;
      celulas[coluna] = valor;
    }
    // Linha só com formatação (o Excel grava assim até lá embaixo): não conta, e não
    // obriga a criar todas as vazias até ela.
    if (celulas.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    if (numero > ULTIMA_LINHA) throw new Error("A planilha passa de 20 mil linhas. Deixe só a lista de pacientes e envie de novo.");
    // Linha 5 do Excel fica no índice 4, com as vazias no meio (o número da linha bate na prévia).
    while (linhas.length < numero - 1) linhas.push([]);
    linhas[numero - 1] = Array.from(celulas, (c) => c ?? null);
  }
  return { linhas, data1904 };
}
