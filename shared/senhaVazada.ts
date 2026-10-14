/**
 * Senha que já apareceu em vazamento de dados (Have I Been Pwned), sem a senha
 * sair de onde foi digitada — o mesmo "k-anonimato" que o Supabase usa no plano
 * pago (o nosso é o grátis):
 *  1. calcula o SHA-1 da senha ali mesmo;
 *  2. pergunta só pelos 5 PRIMEIROS caracteres do hash — volta a lista de
 *     centenas de hashes vazados que começam assim (com enchimento, para nem o
 *     tamanho da resposta entregar nada);
 *  3. confere o resto do hash localmente.
 * Ninguém no caminho (nem o nosso servidor, nem o HIBP) fica sabendo a senha.
 */

export const MENSAGEM_SENHA_VAZADA =
  "Essa senha já apareceu em vazamentos de dados na internet e é das primeiras que um invasor tenta. Escolha outra.";

/** SHA-1 em hexadecimal maiúsculo (o formato do HIBP). Funciona no navegador e no Node. */
export async function sha1Hex(texto: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** O resto do hash está na faixa devolvida? (linhas "SUFIXO:QUANTAS"; enchimento vem com 0). */
export function sufixoNaFaixa(faixa: string, sufixo: string): boolean {
  const alvo = sufixo.toUpperCase();
  return faixa.split("\n").some((linha) => {
    const [suf, vezes] = linha.trim().split(":");
    return suf === alvo && Number(vezes) > 0;
  });
}

export const PREFIXO_HIBP = /^[0-9A-F]{5}$/;

/** Busca a faixa no HIBP (lado do servidor). "" em falha: a checagem nunca bloqueia por o HIBP estar fora. */
export async function faixaDoHibp(prefixo: string, buscar: typeof fetch = fetch): Promise<string> {
  if (!PREFIXO_HIBP.test(prefixo)) return "";
  try {
    const r = await buscar(`https://api.pwnedpasswords.com/range/${prefixo}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(4000),
    });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  }
}

/** Checagem completa (usada pelo servidor no cadastro). */
export async function senhaVazada(senha: string, buscar: typeof fetch = fetch): Promise<boolean> {
  const hash = await sha1Hex(senha);
  return sufixoNaFaixa(await faixaDoHibp(hash.slice(0, 5), buscar), hash.slice(5));
}
