import type { Request } from "express";
import { IMAGEM_DE_COMPARTILHAMENTO, PAGINAS_PUBLICAS, caminhoLimpo, metaDaPagina } from "../shared/paginasDoSite";

/**
 * O HTML de cada página com título, descrição e prévia de compartilhamento.
 *
 * O site é uma SPA: sem isto, toda página saía com o mesmo <title>, e quem mandava
 * o link no WhatsApp via só o endereço, sem imagem nem resumo (o WhatsApp e o Google
 * leem o HTML, não rodam o JavaScript). Ver shared/paginasDoSite.ts.
 */

const esc = (texto: string) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** URL pública do site: a configurada, a do Render, ou a do próprio pedido. */
export function urlBase(req: Pick<Request, "protocol" | "get">): string {
  const configurada = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  return (configurada || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

export function htmlComMetadados(html: string, url: string, base: string): string {
  const meta = metaDaPagina(url);
  const caminho = caminhoLimpo(url);
  const enderecoDaPagina = `${base}${caminho === "/" ? "/" : caminho}`;
  const tags = [
    meta.indexar ? `<link rel="canonical" href="${esc(enderecoDaPagina)}" />` : `<meta name="robots" content="noindex" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="VozInterior" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:title" content="${esc(meta.titulo)}" />`,
    `<meta property="og:description" content="${esc(meta.descricao)}" />`,
    `<meta property="og:url" content="${esc(enderecoDaPagina)}" />`,
    `<meta property="og:image" content="${esc(base + IMAGEM_DE_COMPARTILHAMENTO)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="VozInterior: agenda, prontuário, videochamada e Pix para psicólogas" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join("\n    ");
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(meta.titulo)}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(meta.descricao)}" />`)
    .replace("</head>", `    ${tags}\n  </head>`);
}

/** Robôs leem as páginas públicas; as do app (logadas) e a API não interessam a ninguém. */
export function robotsTxt(base: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /dashboard",
    "Disallow: /videocall/",
    "Disallow: /records",
    "Disallow: /appointments",
    "Disallow: /financeiro",
    "Disallow: /assinatura",
    "Disallow: /solicitacoes",
    "Disallow: /mensagens",
    "Disallow: /consultas",
    "Disallow: /psicologa",
    "Disallow: /documentos",
    "Disallow: /profile",
    "Disallow: /configuracoes",
    "Disallow: /luma",
    "Disallow: /redefinir-senha",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

export function sitemapXml(base: string): string {
  const urls = PAGINAS_PUBLICAS.filter((p) => p.noSitemap)
    .map((p) => `  <url><loc>${esc(base + p.caminho)}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
