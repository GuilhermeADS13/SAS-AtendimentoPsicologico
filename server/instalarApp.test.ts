/**
 * "Instalar o app": o manifesto aponta para ícones que existem, e o service worker
 * NÃO guarda nada em cache — as páginas e a API carregam prontuário, que não pode
 * ficar gravado no aparelho (public/sw.js).
 */
import { describe, expect, it } from "vitest";
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

  it("a página declara o manifesto", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "..", "client", "index.html"), "utf8");
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
  });
});
