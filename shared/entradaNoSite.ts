/**
 * Como a pessoa chega ao cadastro vindo das redes e dos botões de "Testar grátis".
 *
 * Quem toca em "Testar 14 dias grátis" é psicóloga. Antes o botão levava a /login,
 * que abre na aba "Entrar" e, em "Criar conta", vem com "Não, sou paciente" marcado:
 * eram dois toques a mais e um jeito fácil de criar a conta errada.
 */
export const LINK_CADASTRO_PSICOLOGA = "/login?criar=psicologa";

export type CadastroPedido = { aba: "login" | "signup"; psicologa: boolean };

/** Lê o ?criar= da URL de /login. Sem ele, abre em "Entrar", como sempre. */
export function cadastroPedidoNaUrl(busca: string): CadastroPedido {
  const criar = new URLSearchParams(busca).get("criar");
  if (criar === "psicologa") return { aba: "signup", psicologa: true };
  if (criar === "paciente") return { aba: "signup", psicologa: false };
  return { aba: "login", psicologa: false };
}

/**
 * De onde a pessoa veio: ?origem=instagram no link da bio de cada rede. Só letras
 * minúsculas, números, - e _, para não guardar texto livre de quem monta o link.
 */
export const ORIGEM_REGEX = /^[a-z0-9_-]{2,30}$/;

export function origemDaUrl(busca: string): string | null {
  const valor = new URLSearchParams(busca).get("origem")?.trim().toLowerCase();
  return valor && ORIGEM_REGEX.test(valor) ? valor : null;
}
