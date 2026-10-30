/**
 * Baixa um documento do prontuário em PDF ou Word, gerando o arquivo NO NAVEGADOR
 * (mesmo motivo de prontuario-export.ts: o servidor do plano grátis não aguenta).
 * As libs entram por import() dinâmico, só quando alguém pede a conversão.
 */
import { nomeNoFormato } from "@shared/formatosDeDocumento";
import { baixar } from "./prontuario-export";

type Imagem = { jpeg: Uint8Array; dataUrl: string; largura: number; altura: number };

/** Redesenha em JPEG: é o que as duas libs aceitam, venha PNG, WebP ou GIF. */
async function imagemEmJpeg(arquivo: Blob): Promise<Imagem> {
  const bitmap = await createImageBitmap(arquivo);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível converter a imagem.");
  ctx.fillStyle = "#ffffff"; // fundo transparente viraria preto no JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const jpeg = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  return { jpeg, dataUrl, largura: bitmap.width, altura: bitmap.height };
}

/** Maior tamanho que cabe na área, sem deformar. */
function caber(i: Imagem, maxLargura: number, maxAltura: number) {
  const escala = Math.min(maxLargura / i.largura, maxAltura / i.altura, 1);
  return { largura: i.largura * escala, altura: i.altura * escala };
}

async function pdfDeImagem(arquivo: Blob): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 40;
  const imagem = await imagemEmJpeg(arquivo);
  const { largura, altura } = caber(imagem, doc.internal.pageSize.getWidth() - margem * 2, doc.internal.pageSize.getHeight() - margem * 2);
  doc.addImage(imagem.dataUrl, "JPEG", margem, margem, largura, altura);
  return doc.output("blob");
}

async function pdfDeTexto(texto: string): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margem = 56;
  const altoDaLinha = 15;
  const fim = doc.internal.pageSize.getHeight() - margem;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  let y = margem;
  for (const linha of doc.splitTextToSize(texto, doc.internal.pageSize.getWidth() - margem * 2) as string[]) {
    if (y + altoDaLinha > fim) {
      doc.addPage();
      y = margem;
    }
    doc.text(linha, margem, y);
    y += altoDaLinha;
  }
  return doc.output("blob");
}

async function wordDeImagem(arquivo: Blob): Promise<Blob> {
  const { Document, ImageRun, Packer, Paragraph } = await import("docx");
  const imagem = await imagemEmJpeg(arquivo);
  const { largura, altura } = caber(imagem, 600, 800);
  const figura = new ImageRun({ type: "jpg", data: imagem.jpeg, transformation: { width: largura, height: altura } });
  return Packer.toBlob(new Document({ sections: [{ children: [new Paragraph({ children: [figura] })] }] }));
}

async function wordDeTexto(texto: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const paragrafos = texto.split(/\n+/).map((linha) => new Paragraph({ children: [new TextRun(linha)] }));
  return Packer.toBlob(new Document({ sections: [{ children: paragrafos }] }));
}

/**
 * Gera e baixa. `arquivo` e `texto` são funções para só buscar o que este caso
 * precisa: imagem usa o arquivo; PDF e DOCX, o texto que o servidor extrai.
 */
export async function baixarConvertido(
  doc: { fileName: string; fileType: string },
  formato: "pdf" | "word",
  obter: { arquivo: () => Promise<Blob>; texto: () => Promise<string> },
): Promise<void> {
  const imagem = doc.fileType.startsWith("image/");
  let blob: Blob;
  if (imagem) {
    const arquivo = await obter.arquivo();
    blob = await (formato === "pdf" ? pdfDeImagem(arquivo) : wordDeImagem(arquivo));
  } else {
    const texto = doc.fileType === "text/plain" ? await (await obter.arquivo()).text() : await obter.texto();
    if (!texto.trim()) {
      throw new Error("Este arquivo não tem texto para converter (pode ser um documento digitalizado). Baixe o original.");
    }
    blob = await (formato === "pdf" ? pdfDeTexto(texto) : wordDeTexto(texto));
  }
  baixar(blob, nomeNoFormato(doc.fileName, formato === "pdf" ? "pdf" : "docx"));
}
