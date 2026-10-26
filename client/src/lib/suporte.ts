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
 * "Pix copia e cola" da conta que recebe as mensalidades — o mesmo do QR em
 * /pix-qrcode.png (lido da imagem; o CRC confere). Estático e sem valor: a tela
 * "Seu plano" embute o valor de cada psicóloga com shared/pix.ts.
 */
export const PIX_COPIA_E_COLA =
  "00020126580014BR.GOV.BCB.PIX0136ad1102d2-c027-4ac8-baa4-1de690b4219f5204000053039865802BR5925Guilherme Maciel dos Sant6009SAO PAULO62140510WiGAxP4vRq6304CE4E";

export function linkWhatsAppDoSuporte(mensagem: string): string | null {
  const digitos = SUPORTE_WHATSAPP.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
