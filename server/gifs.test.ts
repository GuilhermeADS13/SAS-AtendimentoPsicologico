import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { idDoGif, marcaDeGif, urlDoGif } from "../shared/gif";
import { buscarGifs, mapearRespostaGiphy, rotaDoGif } from "./gifs";

/** GIFs das Mensagens: GIPHY sempre pelo nosso servidor. */
describe("GIFs", () => {
  const chaveOriginal = process.env.GIPHY_API_KEY;
  beforeEach(() => {
    process.env.GIPHY_API_KEY = "chave-de-teste";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (chaveOriginal === undefined) delete process.env.GIPHY_API_KEY;
    else process.env.GIPHY_API_KEY = chaveOriginal;
  });

  describe("marca na mensagem", () => {
    it("ida e volta", () => {
      expect(idDoGif(marcaDeGif("MF9wHplBBbqwYiTTEk"))).toBe("MF9wHplBBbqwYiTTEk");
    });

    it("texto comum não é GIF, nem com a marca no meio", () => {
      expect(idDoGif("olá")).toBeNull();
      expect(idDoGif("veja [gif:MF9wHplBBbqwYiTTEk] aqui")).toBeNull();
      expect(idDoGif(null)).toBeNull();
    });

    it("ID com caractere estranho é recusado", () => {
      expect(idDoGif("[gif:../../etc]")).toBeNull();
      expect(idDoGif("[gif:abc]")).toBeNull();
    });

    it("a imagem vem do NOSSO servidor", () => {
      expect(urlDoGif("MF9wHplBBbqwYiTTEk")).toBe("/api/gif/MF9wHplBBbqwYiTTEk");
    });
  });

  describe("resposta do GIPHY", () => {
    it("pega id e proporção, descartando item inválido", () => {
      const corpo = {
        data: [
          { id: "MF9wHplBBbqwYiTTEk", images: { fixed_width: { width: "200", height: "150" } } },
          { id: "../evil", images: { fixed_width: { width: "200", height: "150" } } },
          { id: "SemTamanho123", images: {} },
        ],
      };
      expect(mapearRespostaGiphy(corpo)).toEqual([{ id: "MF9wHplBBbqwYiTTEk", largura: 200, altura: 150 }]);
    });

    it("resposta quebrada vira lista vazia", () => {
      expect(mapearRespostaGiphy(null)).toEqual([]);
      expect(mapearRespostaGiphy({ data: "x" })).toEqual([]);
    });
  });

  describe("busca", () => {
    it("sem a chave, o recurso fica desligado e nada sai do servidor", async () => {
      delete process.env.GIPHY_API_KEY;
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      expect(await buscarGifs("oi")).toEqual({ disponivel: false, gifs: [] });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("só conteúdo livre (rating g) e a mesma busca usa o cache", async () => {
      const fetch = vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: "MF9wHplBBbqwYiTTEk", images: { fixed_width: { width: "200", height: "200" } } }] })),
      );
      vi.stubGlobal("fetch", fetch);
      const termo = `obrigado-${Math.random()}`;
      const r1 = await buscarGifs(termo);
      const r2 = await buscarGifs(termo);
      expect(r1.gifs).toHaveLength(1);
      expect(r2).toEqual(r1);
      expect(fetch).toHaveBeenCalledTimes(1);
      const url = String((fetch.mock.calls[0] as unknown[])[0]);
      expect(url).toMatch(/^https:\/\/api\.giphy\.com\/v1\/gifs\/search\?/);
      expect(url).toContain("rating=g");
    });

    it("GIPHY fora do ar não derruba a tela", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
      expect(await buscarGifs(`x-${Math.random()}`)).toEqual({ disponivel: true, gifs: [] });
    });
  });

  describe("rota /api/gif/:id", () => {
    const resposta = () => {
      const res = { statusCode: 200, headers: {} as Record<string, string>, corpo: undefined as unknown };
      return Object.assign(res, {
        status(c: number) { res.statusCode = c; return this; },
        end() { return this; },
        setHeader(k: string, v: string) { res.headers[k] = v; },
        send(b: unknown) { res.corpo = b; return this; },
      });
    };

    it("ID inválido nem chega a buscar (não vira proxy para outro endereço)", async () => {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const res = resposta();
      await rotaDoGif({ params: { id: "..%2F..%2Fadmin" } } as never, res as never);
      expect(res.statusCode).toBe(404);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("busca só em media.giphy.com e devolve com cache longo", async () => {
      const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }));
      vi.stubGlobal("fetch", fetch);
      const res = resposta();
      await rotaDoGif({ params: { id: "MF9wHplBBbqwYiTTEk" } } as never, res as never);
      expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe("https://media.giphy.com/media/MF9wHplBBbqwYiTTEk/200w.webp");
      expect(res.headers["Content-Type"]).toBe("image/webp");
      expect(res.headers["Cache-Control"]).toContain("immutable");
    });

    it("se o GIPHY devolver algo que não é imagem, não repassa", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } })));
      const res = resposta();
      await rotaDoGif({ params: { id: "MF9wHplBBbqwYiTTEk" } } as never, res as never);
      expect(res.statusCode).toBe(404);
      expect(res.corpo).toBeUndefined();
    });
  });
});
