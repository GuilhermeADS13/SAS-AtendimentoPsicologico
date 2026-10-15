/**
 * Mensagens de acesso (login, senha) em português.
 *
 * O Supabase devolve o erro em inglês ("Invalid login credentials") e a tela
 * mostrava isso cru. Aqui o código do erro (`code`, estável) vira uma frase que
 * diz o que fazer; a `message` só é olhada quando não há código (versões antigas
 * do cliente e falha de rede).
 */

/** E-mail com usuário, @, domínio e extensão — pega o "nome@outlook" sem o ".com". */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim());
}

const POR_CODIGO: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos. Confira e tente de novo.",
  email_not_confirmed: "Confirme seu e-mail antes de entrar: abra o link que enviamos (veja também o spam).",
  over_request_rate_limit: "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Muitos e-mails enviados há pouco. Aguarde alguns minutos e tente de novo.",
  user_banned: "Este acesso está bloqueado. Fale com o suporte pela página de Ajuda.",
  same_password: "A nova senha precisa ser diferente da atual.",
  weak_password: "Essa senha é fraca. Use uma senha mais forte.",
  session_expired: "Sua sessão expirou. Entre de novo.",
  session_not_found: "Sua sessão expirou. Entre de novo.",
  reauthentication_needed: "Por segurança, entre de novo antes de trocar a senha.",
};

const POR_MENSAGEM: Array<[RegExp, string]> = [
  [/invalid login credentials/i, POR_CODIGO.invalid_credentials],
  [/email not confirmed/i, POR_CODIGO.email_not_confirmed],
  [/rate limit|too many requests/i, POR_CODIGO.over_request_rate_limit],
  [/should be different from the old password/i, POR_CODIGO.same_password],
  [/failed to fetch|network|load failed/i, "Sem conexão com o servidor. Confira sua internet e tente de novo."],
];

export function mensagemDeErroDeAcesso(erro: unknown, padrao: string): string {
  const e = (erro ?? {}) as { code?: unknown; message?: unknown };
  if (typeof e.code === "string" && POR_CODIGO[e.code]) return POR_CODIGO[e.code];
  const msg = typeof e.message === "string" ? e.message : "";
  for (const [re, texto] of POR_MENSAGEM) if (re.test(msg)) return texto;
  return padrao;
}
