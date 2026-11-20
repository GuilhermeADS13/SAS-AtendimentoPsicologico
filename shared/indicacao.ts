/**
 * Indique uma colega (2026-11-19). A regra aprovada em 17/11: quando a colega que criou
 * a conta pelo link assina, as duas ganham 1 mês grátis. O mês é lançado pelo suporte,
 * que vê quem indicou quem na tela Solicitações.
 *
 * O link é o cadastro de psicóloga com ?origem=ind-<código>: o mesmo caminho das origens
 * das redes (shared/entradaNoSite.ts), que a conta guarda no cadastro. O código é o id
 * da conta em base 36: curto e sem dado pessoal no endereço.
 */
const PREFIXO = "ind-";

export function origemDeIndicacao(userId: number): string {
  return `${PREFIXO}${userId.toString(36)}`;
}

/** Id da conta de quem indicou, ou null se a origem não for um link de indicação. */
export function quemIndicou(origem: string | null | undefined): number | null {
  if (!origem?.startsWith(PREFIXO)) return null;
  const codigo = origem.slice(PREFIXO.length);
  if (!/^[0-9a-z]{1,10}$/.test(codigo)) return null;
  const id = parseInt(codigo, 36);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** O cadastro de psicóloga com a origem do link dela (a que o servidor devolve em indicacao.minha). */
export function linkDeIndicacao(base: string, origem: string): string {
  return `${base.replace(/\/+$/, "")}/login?criar=psicologa&origem=${encodeURIComponent(origem)}`;
}

/** A mensagem que ela manda à colega (no WhatsApp ela ainda pode mudar antes de enviar). */
export function mensagemDeIndicacao(link: string): string {
  return (
    "Oi! Uso o VozInterior no consultório: agenda, prontuário, videochamada e Pix num lugar só. " +
    `Se quiser conhecer, crie sua conta por este link: ${link}\n\n` +
    "Quando você assinar, você e eu ganhamos 1 mês grátis 😊"
  );
}
