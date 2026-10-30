/**
 * O que a tela consegue fazer com cada tipo de documento do prontuário. A opção
 * que não funcionaria nem aparece, para não virar um botão que não faz nada.
 */
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
/** Fora daqui, imagem que o navegador não mostra (HEIC, por exemplo). */
const IMAGENS_DO_NAVEGADOR = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type Visualizacao = "pdf" | "imagem" | null;

export function visualizacaoDoArquivo(mime: string): Visualizacao {
  if (mime === "application/pdf") return "pdf";
  return IMAGENS_DO_NAVEGADOR.includes(mime) ? "imagem" : null;
}

export type OpcaoDeDownload = { formato: "pdf" | "word"; rotulo: string };

/**
 * Conversões disponíveis. O original já no formato pedido não entra: o "Arquivo
 * original" cobre. PDF e Word viram um ao outro só pelo TEXTO (o layout não passa
 * de um para o outro), e o rótulo avisa antes do clique.
 */
export function opcoesDeDownload(mime: string): OpcaoDeDownload[] {
  if (mime === "application/pdf") return [{ formato: "word", rotulo: "Em Word (só o texto)" }];
  if (mime === DOCX) return [{ formato: "pdf", rotulo: "Em PDF (só o texto)" }];
  if (mime === "text/plain") {
    return [
      { formato: "pdf", rotulo: "Em PDF" },
      { formato: "word", rotulo: "Em Word" },
    ];
  }
  if (IMAGENS_DO_NAVEGADOR.includes(mime)) {
    return [
      { formato: "pdf", rotulo: "Em PDF" },
      { formato: "word", rotulo: "Em Word" },
    ];
  }
  return [];
}

/** "laudo final.pdf" + "docx" → "laudo final.docx". */
export function nomeNoFormato(nome: string, extensao: string): string {
  return `${nome.replace(/\.[^.]+$/, "")}.${extensao}`;
}
