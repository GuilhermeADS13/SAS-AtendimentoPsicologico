/**
 * Número do suporte técnico, em dígitos com DDD (o 55 do Brasil é acrescentado
 * na hora de montar o link). É informação pública — por isso fica no código, e
 * não numa variável VITE_*, que exigiria mexer no Dockerfile e nos build args do
 * Render para um dado que muda uma vez na vida. Vazio = mostra o e-mail no lugar.
 *
 * Usado pela Ajuda e pela página de Preços (assinatura e "Fale comigo").
 */
const SUPORTE_WHATSAPP = "81992419511";

/**
 * "Pix copia e cola" da conta que recebe as mensalidades — lido do QR estático
 * que o Guilherme mandou (o CRC confere). Sem valor: a aba Assinatura embute o
 * valor de cada psicóloga com shared/pix.ts, no "Copiar Pix" e no QR (QrDoPix).
 */
export const PIX_COPIA_E_COLA =
  "00020126580014BR.GOV.BCB.PIX0136ad1102d2-c027-4ac8-baa4-1de690b4219f5204000053039865802BR5925Guilherme Maciel dos Sant6009SAO PAULO62140510WiGAxP4vRq6304CE4E";

/**
 * Quem vende o serviço (pessoa física, por enquanto sem CNPJ). O Decreto
 * 7.962/2013 pede a identificação do fornecedor em local visível: vai no rodapé,
 * nos Termos de Uso e na Política de Privacidade. É o mesmo nome do Pix acima.
 */
export const RESPONSAVEL_PELO_SERVICO = "Guilherme Maciel dos Santos";

export function linkWhatsAppDoSuporte(mensagem: string): string | null {
  const digitos = SUPORTE_WHATSAPP.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
