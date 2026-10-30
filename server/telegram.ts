/**
 * Aviso no celular do admin pelo Telegram (2026-10-30): o e-mail da primeira
 * cliente caiu na aba Atualizações do Gmail, que não apita, e o CRP ficou dois
 * dias sem conferir. Sem TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID não faz nada.
 *
 * O texto vai para um serviço de fora: nunca colocar nome, CRP ou e-mail de
 * ninguém na mensagem, só o aviso e o link.
 */
export async function enviarTelegram(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const resposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
    signal: AbortSignal.timeout(10_000),
  });
  // Só o status: a URL leva o token, e este erro vai para o log.
  if (!resposta.ok) throw new Error(`Telegram respondeu ${resposta.status}`);
  return true;
}
