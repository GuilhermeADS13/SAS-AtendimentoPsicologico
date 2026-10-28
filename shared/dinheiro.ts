/**
 * Dinheiro em CENTAVOS (inteiro), nunca em reais com ponto flutuante.
 *
 * 0,1 + 0,2 não dá 0,3 em float — somar preços em reais acumularia erro de
 * arredondamento. Guardando centavos como inteiro, R$ 150,00 é 15000 e toda
 * conta é exata. A conversão reais↔centavos fica só nas bordas (input/exibição).
 */

/**
 * Acima disto (R$ 1.000), a tela pede para confirmar o valor da consulta: ele vai
 * DENTRO do Pix do paciente, e "15000" digitado achando que eram R$ 150 virava uma
 * cobrança de R$ 15.000.
 */
export const VALOR_QUE_PEDE_CONFIRMACAO = 100_000;
/** Teto no servidor (R$ 50.000): nenhuma consulta custa isso; é erro de digitação. */
export const VALOR_MAXIMO_DA_CONSULTA = 5_000_000;

/** "150" | "150,50" | "150.5" | "R$ 1.234,56" → centavos (15000, 15050, ...). "" ou inválido → null. */
export function reaisParaCentavos(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null;
  }
  // Tira tudo que não é dígito, vírgula ou ponto; remove separador de milhar e
  // padroniza a vírgula decimal em ponto.
  const limpo = valor.replace(/[^\d.,]/g, "");
  if (!limpo) return null;
  const normalizado = limpo.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centavos → "R$ 150,00". null/undefined → o traço (ou o fallback dado). */
export function formatarBRL(
  centavos: number | null | undefined,
  fallback = "—",
): string {
  if (centavos === null || centavos === undefined) return fallback;
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** Centavos → "150,00" (sem o "R$"), para preencher um <input>. Vazio se nulo. */
export function centavosParaInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}
