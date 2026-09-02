/**
 * Servidores ICE (STUN + TURN) entregues ao cliente na hora da chamada.
 *
 * Por que passa pelo servidor, e não por uma variável VITE_: tudo que é VITE_ vai
 * embutido no bundle e fica visível para qualquer visitante — a própria Metered
 * avisa para nunca expor a secret key no front-end. Aqui a chave fica só no
 * servidor, e o cliente recebe credenciais TEMPORÁRIAS. De quebra, trocar a chave
 * não exige novo build.
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
  const dominio = env.METERED_DOMAIN?.trim();
  const chave = env.METERED_API_KEY?.trim();
  if (!dominio || !chave) return STUN_PADRAO;

  if (cache && cache.expiraEm > Date.now()) return cache.servers;

  // `region` é opcional na API. Vale definir: numa chamada relayada em tempo real,
  // um relay longe do Brasil adiciona latência que se sente na conversa. Sem a
  // variável, a Metered usa a "Default Region".
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
