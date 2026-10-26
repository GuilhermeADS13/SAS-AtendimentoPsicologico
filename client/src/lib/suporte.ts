/**
 * Número do suporte técnico, em dígitos com DDD (o 55 do Brasil é acrescentado
 * na hora de montar o link). É informação pública — por isso fica no código, e
 * não numa variável VITE_*, que exigiria mexer no Dockerfile e nos build args do
 * Render para um dado que muda uma vez na vida. Vazio = mostra o e-mail no lugar.
 *
 * Usado pela Ajuda e pela página de Preços (assinatura e "Fale comigo").
 */
const SUPORTE_WHATSAPP = "81992419511";

export function linkWhatsAppDoSuporte(mensagem: string): string | null {
  const digitos = SUPORTE_WHATSAPP.replace(/\D/g, "");
  if (!digitos) return null;
  const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
