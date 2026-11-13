/**
 * Quem estava na busca de psicólogas e tocou em "Entrar para pedir" volta para o
 * mesmo perfil depois do login (ou da confirmação do e-mail, se for no mesmo
 * navegador). Fica no localStorage por um dia; só aceita as páginas da busca,
 * para o endereço guardado nunca levar a outro lugar.
 */
const CHAVE = "vozinterior-voltar-depois-do-login";
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const PERMITIDO = /^\/(encontrar-psicologa|psicologas\/\d{1,9})$/;

export function guardarVoltaDepoisDoLogin(caminho: string): void {
  if (!PERMITIDO.test(caminho)) return;
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ caminho, em: Date.now() }));
  } catch {
    // Sem localStorage, a pessoa só cai na área dela, como antes.
  }
}

/** Devolve (e apaga) o caminho guardado, se ainda valer. */
export function tirarVoltaDepoisDoLogin(): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    localStorage.removeItem(CHAVE);
    if (!bruto) return null;
    const { caminho, em } = JSON.parse(bruto) as { caminho?: unknown; em?: unknown };
    if (typeof caminho !== "string" || typeof em !== "number") return null;
    if (Date.now() - em > VALIDADE_MS || !PERMITIDO.test(caminho)) return null;
    return caminho;
  } catch {
    return null;
  }
}
