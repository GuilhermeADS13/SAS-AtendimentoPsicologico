/**
 * Quem tentou abrir uma página que exige login (a sala da consulta pelo link do
 * e-mail, a agenda...) ou estava na busca de psicólogas volta para lá depois do
 * login (ou da confirmação do e-mail, se for no mesmo navegador). Fica no
 * localStorage por um dia; só aceita caminhos internos conhecidos, para o
 * endereço guardado nunca levar a outro lugar.
 */
const CHAVE = "vozinterior-voltar-depois-do-login";
const VALIDADE_MS = 24 * 60 * 60 * 1000;
const PERMITIDO = new RegExp(
  "^/(?:" +
    [
      "encontrar-psicologa",
      "psicologas/\\d{1,9}",
      // Sala: apt<id>-<token nanoid> (ou o formato antigo), com os ids que a sala usa na query.
      "videocall/(?:apt\\d{1,9}-[\\w-]{8,32}|sala-apt\\d{1,9})(?:\\?apt=\\d{1,9}&pat=\\d{1,9})?",
      "records(?:/\\d{1,9})?",
      "(?:dashboard|consultas|mensagens|documentos|psicologa|rede|appointments|financeiro|assinatura|profile|configuracoes|luma|solicitacoes)",
    ].join("|") +
    ")$",
);

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
