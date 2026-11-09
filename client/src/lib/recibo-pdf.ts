import { formatarBRL } from "@shared/dinheiro";
import { textoDoRecibo, totalDoRecibo, type DadosDoRecibo } from "@shared/recibo";

/**
 * Recibo de pagamento em PDF (A4), com o texto de shared/recibo.ts. O jspdf entra
 * por import() dinâmico, como no prontuário: só carrega quando alguém gera um recibo.
 */
export async function baixarReciboPdf(dados: DadosDoRecibo, nomeDoArquivo: string): Promise<void> {
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

  doc.save(nomeDoArquivo);
}
