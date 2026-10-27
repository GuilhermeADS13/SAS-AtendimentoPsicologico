import { useMemo } from "react";
import qrcode from "qrcode-generator";

/**
 * QR code do Pix COM O VALOR embutido (o mesmo "copia e cola" de pixComValor),
 * para quem paga escaneando: o app do banco já abre com o valor certo e ela não
 * digita — nem erra — o valor (pedido de 2026-10-27).
 *
 * Nível de correção "L", o mesmo do QR estático que o Nubank gera: na tela não
 * há sujeira nem dobra para corrigir, e o código fica menor e mais fácil de ler.
 * Desenhado em SVG (um path só), nítido em qualquer tamanho; fundo branco com a
 * margem de 4 módulos que os leitores exigem.
 */
export function QrDoPix({ codigo, titulo, className = "size-44" }: { codigo: string; titulo: string; className?: string }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, "L");
    q.addData(codigo, "Byte");
    q.make();
    const total = q.getModuleCount();
    let caminho = "";
    for (let l = 0; l < total; l++) {
      for (let c = 0; c < total; c++) {
        if (q.isDark(l, c)) caminho += `M${c},${l}h1v1h-1z`;
      }
    }
    return { n: total, d: caminho };
  }, [codigo]);

  return (
    <svg viewBox={`-4 -4 ${n + 8} ${n + 8}`} role="img" aria-label={titulo} shapeRendering="crispEdges" className={className}>
      <rect x={-4} y={-4} width={n + 8} height={n + 8} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
