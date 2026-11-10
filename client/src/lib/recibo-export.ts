import { formatarBRL } from "@shared/dinheiro";
import { textoDoRecibo, totalDoRecibo, type DadosDoRecibo } from "@shared/recibo";

/** Imagem do comprovante já pronta para o PDF (JPEG). */
export type Comprovante = { dataUrl: string; largura: number; altura: number };

/**
 * Print ou foto do comprovante -> JPEG de até 1600 px. Passa pelo canvas para
 * aceitar o que o navegador abrir (PNG, WebP...) e não inchar o PDF com foto de 12 MP.
 */
export async function imagemDoComprovante(arquivo: File): Promise<Comprovante> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falhou) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falhou(new Error(`Não deu para abrir "${arquivo.name}". Envie um print ou foto (JPG ou PNG).`));
      i.src = url;
    });
    const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const largura = Math.round(img.naturalWidth * escala);
    const altura = Math.round(img.naturalHeight * escala);
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // PNG com fundo transparente não vira preto no JPEG.
    ctx.fillRect(0, 0, largura, altura);
    ctx.drawImage(img, 0, 0, largura, altura);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), largura, altura };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Recibo de pagamento em PDF (A4), com o texto de shared/recibo.ts. O jspdf entra
 * por import() dinâmico, como no prontuário: só carrega quando alguém gera um recibo.
 * Os comprovantes anexados entram depois, um por página.
 */
export async function reciboEmPdf(dados: DadosDoRecibo, comprovantes: Comprovante[] = []): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 64;
  const util = largura - margem * 2;
  const verde = "#215756";
  const texto = textoDoRecibo(dados);
  let y = 84;

  // Título e valor em destaque.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(verde);
  doc.text(texto.titulo, margem, y);
  doc.setFontSize(16);
  doc.setTextColor("#1f2d2d");
  doc.text(formatarBRL(totalDoRecibo(dados)).replace(/\u00a0/g, " "), largura - margem, y, { align: "right" });
  y += 14;
  doc.setDrawColor(verde);
  doc.setLineWidth(1.2);
  doc.line(margem, y, largura - margem, y);
  y += 40;

  // Corpo.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor("#1f2d2d");
  for (const paragrafo of texto.corpo) {
    const linhas = doc.splitTextToSize(paragrafo, util) as string[];
    doc.text(linhas, margem, y, { lineHeightFactor: 1.6 });
    y += linhas.length * 12 * 1.6 + 14;
  }

  // Local e data.
  y += 14;
  doc.text(texto.local, margem, y);

  // Assinatura.
  y += 90;
  doc.setDrawColor("#9aa5a5");
  doc.setLineWidth(0.6);
  doc.line(margem, y, margem + 260, y);
  y += 18;
  texto.assinatura.forEach((linha, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(i === 0 ? 12 : 10.5);
    doc.setTextColor(i === 0 ? "#1f2d2d" : "#4b5757");
    for (const parte of doc.splitTextToSize(linha, util) as string[]) {
      doc.text(parte, margem, y);
      y += 15;
    }
  });

  // Rodapé discreto.
  const altura = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor("#8a9696");
  doc.text("Recibo emitido pelo VozInterior.", margem, altura - 40);

  comprovantes.forEach((c, i) => {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(verde);
    const titulo = comprovantes.length > 1 ? `Comprovante de pagamento (${i + 1} de ${comprovantes.length})` : "Comprovante de pagamento";
    doc.text(titulo, margem, 72);
    // Cabe na página sem distorcer: limita pela largura e pela altura livres.
    const topo = 96;
    const maxAltura = altura - topo - 64;
    const escala = Math.min(util / c.largura, maxAltura / c.altura);
    const w = c.largura * escala;
    const h = c.altura * escala;
    doc.addImage(c.dataUrl, "JPEG", margem + (util - w) / 2, topo, w, h);
  });

  return doc.output("blob");
}

function bytesDoDataUrl(dataUrl: string): Uint8Array {
  const binario = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/** O mesmo recibo em Word (.docx), para quem quer ajustar o texto ou imprimir no timbrado. */
export async function reciboEmWord(dados: DadosDoRecibo, comprovantes: Comprovante[] = []): Promise<Blob> {
  const { AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph, TabStopType, TextRun } = await import("docx");
  const texto = textoDoRecibo(dados);
  const verde = "215756";
  const fonte = "Arial";
  // A4 com margens de ~2,3 cm: 9026 twips úteis (a tabulação do valor vai até a borda direita).
  const larguraUtil = 9026;
  const filhos: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: larguraUtil }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: verde, space: 6 } },
      spacing: { after: 480 },
      children: [
        new TextRun({ text: texto.titulo, bold: true, size: 44, color: verde, font: fonte }),
        new TextRun({ text: `\t${formatarBRL(totalDoRecibo(dados)).replace(/\u00a0/g, " ")}`, bold: true, size: 32, font: fonte }),
      ],
    }),
    ...texto.corpo.map(
      (p) => new Paragraph({ spacing: { after: 240, line: 384 }, children: [new TextRun({ text: p, size: 24, font: fonte })] }),
    ),
    new Paragraph({ spacing: { before: 240, after: 1440 }, children: [new TextRun({ text: texto.local, size: 24, font: fonte })] }),
    new Paragraph({ children: [new TextRun({ text: "_______________________________________", color: "9AA5A5", font: fonte })] }),
    ...texto.assinatura.map(
      (linha, i) =>
        new Paragraph({
          children: [new TextRun({ text: linha, bold: i === 0, size: i === 0 ? 24 : 21, color: i === 0 ? "1F2D2D" : "4B5757", font: fonte })],
        }),
    ),
    new Paragraph({
      spacing: { before: 960 },
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: "Recibo emitido pelo VozInterior.", size: 17, color: "8A9696", font: fonte })],
    }),
  ];

  comprovantes.forEach((c, i) => {
    const titulo = comprovantes.length > 1 ? `Comprovante de pagamento (${i + 1} de ${comprovantes.length})` : "Comprovante de pagamento";
    // Cabe em ~16 x 22 cm sem distorcer (medidas do docx em pixels de 96 dpi).
    const escala = Math.min(600 / c.largura, 820 / c.altura, 1);
    filhos.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { after: 240 },
        children: [new TextRun({ text: titulo, bold: true, size: 28, color: verde, font: fonte })],
      }),
      new Paragraph({
        children: [
          new ImageRun({
            type: "jpg",
            data: bytesDoDataUrl(c.dataUrl),
            transformation: { width: Math.round(c.largura * escala), height: Math.round(c.altura * escala) },
          }),
        ],
      }),
    );
  });

  return Packer.toBlob(new Document({ sections: [{ children: filhos }] }));
}

/**
 * O aparelho sabe mandar ARQUIVO para outro app (WhatsApp, e-mail...)? Celular
 * quase sempre; no computador depende do navegador. Sem isso o botão nem aparece.
 */
export function podeEnviarArquivo(): boolean {
  try {
    const teste = new File(["x"], "recibo.pdf", { type: "application/pdf" });
    return typeof navigator.share === "function" && !!navigator.canShare?.({ files: [teste] });
  } catch {
    return false;
  }
}

/**
 * Abre a lista de apps do aparelho com o arquivo. Devolve "cancelado" quando a
 * pessoa fecha a lista, e "sem-permissao" quando o navegador recusou por ter
 * passado tempo demais desde o toque (gerar o arquivo demora): aí basta tocar de novo.
 */
export async function enviarArquivo(blob: Blob, nome: string, titulo: string): Promise<"enviado" | "cancelado" | "sem-permissao"> {
  const arquivo = new File([blob], nome, { type: blob.type });
  try {
    await navigator.share({ files: [arquivo], title: titulo });
    return "enviado";
  } catch (e) {
    const nomeDoErro = (e as { name?: string })?.name;
    if (nomeDoErro === "AbortError") return "cancelado";
    if (nomeDoErro === "NotAllowedError") return "sem-permissao";
    throw e;
  }
}
