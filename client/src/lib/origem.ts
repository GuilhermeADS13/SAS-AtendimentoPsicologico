import { ORIGEM_REGEX, origemDaUrl } from "@shared/entradaNoSite";

/**
 * Guarda neste navegador de onde a pessoa chegou (?origem= no link da bio), para
 * ir junto no cadastro, mesmo que ela navegue pelo site antes de criar a conta.
 * Vale a primeira origem: quem volta depois por outro link não apaga a primeira.
 */
const CHAVE = "vozinterior:origem";

export function guardarOrigemDaUrl(busca: string = window.location.search): void {
  const origem = origemDaUrl(busca);
  if (!origem) return;
  try {
    if (!localStorage.getItem(CHAVE)) localStorage.setItem(CHAVE, origem);
  } catch {}
}

export function origemGuardada(): string | undefined {
  try {
    const valor = localStorage.getItem(CHAVE);
    return valor && ORIGEM_REGEX.test(valor) ? valor : undefined;
  } catch {
    return undefined;
  }
}
