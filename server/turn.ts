/**
 * Servidores ICE (STUN + TURN) entregues ao cliente na hora da chamada.
 *
 * Por que passa pelo servidor, e não por uma variável VITE_: tudo que é VITE_ vai
 * embutido no bundle e fica visível para qualquer visitante — a própria Metered
 * avisa para nunca expor a secret key no front-end. Aqui a chave fica só no
 * servidor, e o cliente recebe apenas as credenciais de relay — nunca a chave.
 * De quebra, trocar a chave não exige novo build.
 *
 * O TURN só entra em ação quando a conexão direta (P2P) falha — redes com NAT
 * simétrico, firewall corporativo, algumas operadoras móveis. Nas demais chamadas
 * a mídia continua indo direto e não consome a cota.
 *
 * Sem as variáveis configuradas, devolve só STUN: a videochamada continua
 * funcionando como antes, sem TURN. Nunca deixa a chamada sem configuração.
 */

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** STUN público do Google: só descobre o endereço externo, não trafega mídia. */
const STUN_PADRAO: IceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/**
 * Cache curto só para não bater na API a cada entrada em sala.
 *
 * A documentação da Metera NÃO informa validade (TTL) das credenciais, então o
 * prazo aqui é conservador de propósito: se elas expirarem antes do que supomos,
 * o pior caso é uma janela curta com credencial vencida — e, mesmo aí, a chamada
 * cai para STUN em vez de falhar.
 */
let cache: { servers: IceServer[]; expiraEm: number } | null = null;
const CACHE_MS = 30 * 60_000;

export async function iceServersParaChamada(env: NodeJS.ProcessEnv = process.env): Promise<IceServer[]> {
  // trim(): mesma proteção do resto do projeto contra \r de .env feito no Windows.
  // Tolera "https://dominio/" colado inteiro: o painel exibe só o domínio, mas é
  // fácil copiar a URL junto — e aí o fetch iria para "https://https://..." e a
  // chamada cairia calada no fallback de STUN.
  const dominio = env.METERED_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const chave = env.METERED_API_KEY?.trim();
  if (!dominio || !chave) return STUN_PADRAO;

  if (cache && cache.expiraEm > Date.now()) return cache.servers;

  // `region` normalmente NÃO deve ser preenchida. Ao usar a API com a chave da
  // credencial, a Metered já inclui na resposta a região configurada no painel —
  // e o padrão de lá é "Global (automático)", que roteia para o servidor mais
  // próximo do usuário (não existe região sul-americana, então automático é o
  // melhor caso para o Brasil). Definir esta variável SOBRESCREVE esse automático
  // por uma região fixa; só use se souber exatamente por quê.
  const regiao = env.METERED_REGION?.trim();
  const params = new URLSearchParams({ apiKey: chave });
  if (regiao) params.set("region", regiao);

  try {
    const resposta = await fetch(`https://${dominio}/api/v1/turn/credentials?${params.toString()}`);
    if (!resposta.ok) throw new Error(`Metered respondeu ${resposta.status}`);
    const lista = (await resposta.json()) as IceServer[];
    if (!Array.isArray(lista) || lista.length === 0) {
      throw new Error("Metered não devolveu servidores");
    }
    const servers = [...STUN_PADRAO, ...lista];
    cache = { servers, expiraEm: Date.now() + CACHE_MS };
    return servers;
  } catch (erro) {
    // Falhar aqui NÃO pode derrubar a consulta: segue com STUN, que atende a
    // maioria das redes. A chave nunca entra no log.
    console.warn(
      "[turn] credenciais indisponíveis, seguindo só com STUN:",
      erro instanceof Error ? erro.message : erro,
    );
    return STUN_PADRAO;
  }
}

/** Só para os testes: descarta o cache entre casos. */
export function limparCacheTurn(): void {
  cache = null;
}
