import type { Request, Response } from "express";
import { ID_DE_GIF } from "../shared/gif";

/**
 * GIFs pelo GIPHY, sempre passando pelo NOSSO servidor.
 *
 * Num sistema clínico, deixar o navegador do paciente falar direto com o GIPHY
 * entregaria a ele o IP e o que a pessoa busca. Aqui quem fala com o GIPHY é o
 * servidor, com a chave dele: o GIPHY só vê o SAS. A busca em si (o termo) ainda
 * vai para lá — é inevitável para buscar.
 *
 * `rating=g`: só conteúdo livre para todos, o adequado para uma conversa com a
 * psicóloga. Sem a variável GIPHY_API_KEY, o recurso simplesmente não aparece.
 */

export type Gif = { id: string; largura: number; altura: number };

const CACHE_MS = 10 * 60_000;
const MAX_NO_CACHE = 200;
// A chave gratuita do GIPHY aceita poucas chamadas por hora: a mesma busca (e a
// lista de "em alta") é reaproveitada por 10 minutos para todo mundo.
const cache = new Map<string, { quando: number; gifs: Gif[] }>();

export const gifsConfigurados = () => Boolean(process.env.GIPHY_API_KEY);

/** Converte a resposta do GIPHY, descartando o que não tiver ID válido. */
export function mapearRespostaGiphy(corpo: unknown): Gif[] {
  const dados = (corpo as { data?: unknown })?.data;
  if (!Array.isArray(dados)) return [];
  const gifs: Gif[] = [];
  for (const item of dados) {
    const id = (item as { id?: unknown })?.id;
    const img = (item as { images?: { fixed_width?: { width?: unknown; height?: unknown } } })?.images?.fixed_width;
    const largura = Number(img?.width);
    const altura = Number(img?.height);
    if (typeof id !== "string" || !ID_DE_GIF.test(id) || !(largura > 0) || !(altura > 0)) continue;
    gifs.push({ id, largura, altura });
  }
  return gifs;
}

export async function buscarGifs(busca?: string): Promise<{ disponivel: boolean; gifs: Gif[] }> {
  const chave = process.env.GIPHY_API_KEY;
  if (!chave) return { disponivel: false, gifs: [] };

  const termo = (busca ?? "").trim().toLowerCase().slice(0, 50);
  const chaveDoCache = termo || "\u0000em-alta";
  const guardado = cache.get(chaveDoCache);
  if (guardado && Date.now() - guardado.quando < CACHE_MS) return { disponivel: true, gifs: guardado.gifs };

  const params = new URLSearchParams({ api_key: chave, limit: "24", rating: "g" });
  if (termo) {
    params.set("q", termo);
    params.set("lang", "pt");
  }
  const url = `https://api.giphy.com/v1/gifs/${termo ? "search" : "trending"}?${params.toString()}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error(`GIPHY respondeu ${r.status}`);
    const gifs = mapearRespostaGiphy(await r.json());
    if (cache.size >= MAX_NO_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(chaveDoCache, { quando: Date.now(), gifs });
    return { disponivel: true, gifs };
  } catch (err) {
    // Não loga a URL: ela leva a chave.
    console.warn("[gifs] busca falhou:", err instanceof Error ? err.message : "erro");
    return { disponivel: true, gifs: [] };
  }
}

/**
 * GET /api/gif/:id — entrega a imagem do GIF buscando no GIPHY pelo servidor.
 *
 * Só aceita ID no formato do GIPHY e só busca em media.giphy.com: não dá para usar
 * a rota como proxy para outro endereço. Sem autenticação porque `<img>` não manda
 * o token de sessão — por isso tem limite de requisições próprio (em index.ts) e
 * cache longo no navegador (a imagem de um ID nunca muda).
 */
export async function rotaDoGif(req: Request, res: Response) {
  const id = String(req.params.id ?? "");
  if (!gifsConfigurados() || !ID_DE_GIF.test(id)) {
    res.status(404).end();
    return;
  }
  try {
    const r = await fetch(`https://media.giphy.com/media/${id}/200w.webp`, { signal: AbortSignal.timeout(8000) });
    const tipo = r.headers.get("content-type") ?? "";
    const tamanho = Number(r.headers.get("content-length") ?? 0);
    if (!r.ok || !tipo.startsWith("image/") || tamanho > 5_000_000) {
      res.status(404).end();
      return;
    }
    const corpo = Buffer.from(await r.arrayBuffer());
    if (corpo.length > 5_000_000) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", tipo);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.send(corpo);
  } catch {
    res.status(502).end();
  }
}
