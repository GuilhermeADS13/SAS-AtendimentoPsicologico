import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PAGINAS_PUBLICAS, ROTAS_DO_APP, caminhoLimpo, metaDaPagina, rotaExiste } from "../shared/paginasDoSite";
import { htmlComMetadados, robotsTxt, sitemapXml } from "./paginaHtml";

const raiz = path.resolve(__dirname, "..");
const BASE = "https://sas.exemplo";
const INDEX = fs.readFileSync(path.join(raiz, "client", "index.html"), "utf-8");

describe("rotas do site", () => {
  it("a lista do servidor é a mesma do App.tsx (senão uma página nova sairia como 404)", () => {
    const app = fs.readFileSync(path.join(raiz, "client", "src", "App.tsx"), "utf-8");
    const doApp = [...app.matchAll(/<Route path=\{"([^"]+)"\}/g)].map((m) => m[1]).sort();
    expect([...ROTAS_DO_APP].sort()).toEqual(doApp);
  });

  it("reconhece as rotas, com parâmetro, query e barra no fim", () => {
    for (const ok of ["/", "/precos", "/precos?origem=instagram", "/precos/", "/records/12", "/videocall/apt1-abc", "/login?criar=psicologa"]) {
      expect(rotaExiste(ok), ok).toBe(true);
    }
    for (const nao of ["/nada", "/records/1/extra", "/404", "/wp-admin", "/precosx", "/.env"]) {
      expect(rotaExiste(nao), nao).toBe(false);
    }
  });

  it("caminhoLimpo tira query, âncora e barra do fim", () => {
    expect(caminhoLimpo("/precos/?origem=x#planos")).toBe("/precos");
    expect(caminhoLimpo("/?a=1")).toBe("/");
    expect(caminhoLimpo("")).toBe("/");
  });
});

describe("título e descrição", () => {
  it("cada página pública tem título e descrição próprios, no tamanho que o Google mostra", () => {
    const titulos = new Set(PAGINAS_PUBLICAS.map((p) => p.titulo));
    const descricoes = new Set(PAGINAS_PUBLICAS.map((p) => p.descricao));
    expect(titulos.size).toBe(PAGINAS_PUBLICAS.length);
    expect(descricoes.size).toBe(PAGINAS_PUBLICAS.length);
    for (const p of PAGINAS_PUBLICAS) {
      expect(p.titulo.length, p.titulo).toBeLessThanOrEqual(70);
      expect(p.descricao.length, p.descricao).toBeGreaterThanOrEqual(70);
      expect(p.descricao.length, p.descricao).toBeLessThanOrEqual(160);
    }
  });

  it("páginas do app e endereços inexistentes não são indexados", () => {
    expect(metaDaPagina("/precos").indexar).toBe(true);
    expect(metaDaPagina("/dashboard").indexar).toBe(false);
    expect(metaDaPagina("/nao-existe")).toMatchObject({ indexar: false, titulo: expect.stringContaining("não encontrada") });
  });
});

describe("HTML de cada página", () => {
  it("troca título e descrição e põe a prévia de compartilhamento", () => {
    const html = htmlComMetadados(INDEX, "/precos?origem=instagram", BASE);
    expect(html).toContain("<title>Planos e preços — VozInterior</title>");
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
    expect(html).toContain(`<link rel="canonical" href="${BASE}/precos" />`);
    expect(html).toContain(`<meta property="og:image" content="${BASE}/og-vozinterior.jpg" />`);
    expect(html).toContain('<meta property="og:title" content="Planos e preços — VozInterior" />');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toContain('content="noindex"');
  });

  it("endereço inexistente sai com noindex e sem canonical", () => {
    const html = htmlComMetadados(INDEX, "/qualquer-coisa", BASE);
    expect(html).toContain('<meta name="robots" content="noindex" />');
    expect(html).not.toContain('rel="canonical"');
  });

  it("o endereço pedido não injeta código no HTML", () => {
    const html = htmlComMetadados(INDEX, '/x"><script>alert(1)</script>', BASE);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("a imagem de compartilhamento existe e tem o tamanho certo para a prévia", () => {
    const arquivo = path.join(raiz, "client", "public", "og-vozinterior.jpg");
    const bytes = fs.readFileSync(arquivo);
    expect(bytes.length).toBeLessThan(300_000);
    // JPEG: marcador SOF0/SOF2 traz altura e largura.
    const i = bytes.findIndex((b, k) => b === 0xff && (bytes[k + 1] === 0xc0 || bytes[k + 1] === 0xc2));
    expect([bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)]).toEqual([1200, 630]);
  });
});

describe("robots.txt e sitemap.xml", () => {
  it("robots libera o site, fecha a API e as telas logadas e aponta o sitemap", () => {
    const txt = robotsTxt(BASE);
    expect(txt).toContain("Disallow: /api/");
    expect(txt).toContain("Disallow: /dashboard");
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });

  it("sitemap lista só as páginas públicas que valem a busca", () => {
    const xml = sitemapXml(BASE);
    for (const p of ["/", "/precos", "/ajuda", "/privacidade", "/termos"]) expect(xml).toContain(`<loc>${BASE}${p}</loc>`);
    expect(xml).not.toContain("/login");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});
