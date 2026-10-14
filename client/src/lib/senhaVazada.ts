import { sha1Hex, sufixoNaFaixa } from "@shared/senhaVazada";

/**
 * Checagem de senha vazada NO NAVEGADOR (redefinir e trocar senha, que vão
 * direto ao Supabase). Só os 5 primeiros caracteres do hash saem daqui, pela
 * rota `auth.faixaDeSenhasVazadas`; a comparação é feita aqui. Ver
 * shared/senhaVazada.ts.
 *
 * Nunca bloqueia por falha técnica: sem `crypto.subtle` (página fora de HTTPS)
 * ou com o HIBP fora do ar, devolve false e a troca segue.
 */
export async function senhaVazadaNoNavegador(
  senha: string,
  buscarFaixa: (prefixo: string) => Promise<string>,
): Promise<boolean> {
  try {
    if (!globalThis.crypto?.subtle) return false;
    const hash = await sha1Hex(senha);
    return sufixoNaFaixa(await buscarFaixa(hash.slice(0, 5)), hash.slice(5));
  } catch {
    return false;
  }
}
