/**
 * "Instalar o app": o manifesto aponta para ícones que existem, e o service worker
 * NÃO guarda nada em cache — as páginas e a API carregam prontuário, que não pode
 * ficar gravado no aparelho (public/sw.js).
 */
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const publico = path.resolve(__dirname, "..", "client", "public");
const ler = (arquivo: string) => fs.readFileSync(path.join(publico, arquivo), "utf8");

describe("instalar como app", () => {
  it("o manifesto tem nome, início, modo app e ícones que existem", () => {
    const manifesto = JSON.parse(ler("manifest.webmanifest")) as {
      name: string; start_url: string; display: string; icons: { src: string; sizes: string; purpose: string }[];
    };
    expect(manifesto.name).toBe("VozInterior");
    expect(manifesto.start_url).toBe("/");
    expect(manifesto.display).toBe("standalone");
    expect(manifesto.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifesto.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icone of manifesto.icons) expect(fs.existsSync(path.join(publico, icone.src))).toBe(true);
  });

  it("o service worker não usa cache e só trata a abertura de página", () => {
    const sw = ler("sw.js");
    expect(sw).not.toMatch(/\bcaches\b|cache\.put|CacheStorage|indexedDB/);
    expect(sw).toContain('event.request.mode !== "navigate"');
  });

  it("a página declara o manifesto e o ícone do iPhone", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "..", "client", "index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(fs.existsSync(path.join(publico, "apple-touch-icon.png"))).toBe(true);
  });
});

describe("qual instrução cada navegador recebe", () => {
  const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const casos: [string, string, number, { safariMac: boolean; apple: boolean }][] = [
    ["Safari 17 no Mac", `${MAC} Version/17.4 Safari/605.1.15`, 0, { safariMac: true, apple: false }],
    ["Safari 16 no Mac (ainda não instala)", `${MAC} Version/16.6 Safari/605.1.15`, 0, { safariMac: false, apple: false }],
    ["Chrome no Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", 0, { safariMac: false, apple: false }],
    ["Edge no Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", 0, { safariMac: false, apple: false }],
    ["iPad (se apresenta como Mac, mas tem toque)", `${MAC} Version/17.4 Safari/605.1.15`, 5, { safariMac: false, apple: true }],
    ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1", 5, { safariMac: false, apple: true }],
  ];

  it.each(casos)("%s", async (_nome, userAgent, maxTouchPoints, esperado) => {
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints });
    try {
      const { ehAparelhoApple, ehSafariNoMacQueInstala } = await import("../client/src/lib/instalarApp");
      expect({ safariMac: ehSafariNoMacQueInstala(), apple: ehAparelhoApple() }).toEqual(esperado);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
