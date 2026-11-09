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
export async function baixarReciboPdf(dados: DadosDoRecibo, nomeDoArquivo: string, comprovantes: Comprovante[] = []): Promise<void> {
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
  doc.text(formatarBRL(totalDoRecibo(dados)).replace(/ /g, " "), largura - margem, y, { align: "right" });
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

  doc.save(nomeDoArquivo);
}
