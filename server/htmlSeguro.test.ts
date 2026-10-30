import { describe, expect, it } from "vitest";
import { limparArvore } from "../shared/htmlSeguro";

/**
 * Filtro do HTML exibido nas respostas da Luma e no "Ver formatado". Os ataques
 * abaixo PASSAVAM pelo Streamdown (testado): iframe srcdoc roda com a origem do
 * site, meta refresh redireciona, imagem externa vaza dado pela URL.
 */
type No = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: No[]; value?: string };
const el = (tagName: string, properties: Record<string, unknown> = {}, children: No[] = []): No => ({ type: "element", tagName, properties, children });
const txt = (value: string): No => ({ type: "text", value });
const raiz = (...children: No[]) => ({ type: "root", children });
const tags = (n: No): string[] => [...(n.tagName ? [n.tagName] : []), ...(n.children ?? []).flatMap(tags)];

describe("filtro de HTML do markdown", () => {
  it.each(["iframe", "script", "style", "meta", "form", "object", "embed", "svg", "img", "link", "base"])(
    "remove <%s> com o conteúdo",
    (tag) => {
      const r = limparArvore(raiz(el("p", {}, [txt("antes")]), el(tag, { srcDoc: "<script>x</script>" }, [txt("dentro")])));
      expect(tags(r)).not.toContain(tag);
      expect(JSON.stringify(r)).not.toContain("dentro");
    },
  );

  it("tira atributos de evento, style e srcdoc", () => {
    const r = limparArvore(raiz(el("p", { onClick: "x", style: "position:fixed", srcDoc: "y", title: "z" }, [txt("ok")])));
    expect((r.children![0] as No).properties).toEqual({});
  });

  it("só as classes de cor e alinhamento da barra passam, não as do site", () => {
    const r = limparArvore(raiz(el("span", { className: ["nota-cor-azul", "nota-centro", "nota-cor-preto", "fixed", "inset-0"] }, [txt("ok")])));
    expect((r.children![0] as No).properties).toEqual({ className: ["nota-cor-azul", "nota-centro"] });
  });

  it("link só https/mailto/tel/rota interna", () => {
    const href = (h: string) => (limparArvore(raiz(el("a", { href: h }, [txt("l")]))).children![0] as No).properties?.href;
    expect(href("https://exemplo.com")).toBe("https://exemplo.com");
    expect(href("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(href("/consultas")).toBe("/consultas");
    expect(href("javascript:alert(1)")).toBeUndefined();
    expect(href("data:text/html,<script>")).toBeUndefined();
    expect(href("//evil.example")).toBeUndefined();
  });

  it("classe livre sai (overlay com as classes do site); a do markdown fica", () => {
    const r = limparArvore(raiz(el("div", { className: ["fixed", "inset-0", "z-50"] }), el("ul", { className: ["contains-task-list"] })));
    expect((r.children![0] as No).properties?.className).toBeUndefined();
    expect((r.children![1] as No).properties?.className).toEqual(["contains-task-list"]);
  });

  it("caixa de tarefa fica; outro input sai", () => {
    const r = limparArvore(raiz(el("input", { type: "checkbox", checked: true }), el("input", { type: "text", name: "senha" })));
    expect(r.children).toHaveLength(1);
  });

  it("tag desconhecida vira só o texto", () => {
    const r = limparArvore(raiz(el("center", {}, [txt("meio")])));
    expect(r.children).toEqual([txt("meio")]);
  });

  it("formatação clínica normal passa intacta", () => {
    const arvore = raiz(el("h2", {}, [txt("Evolução")]), el("p", {}, [el("strong", {}, [txt("n")]), el("u", {}, [txt("s")]), el("del", {}, [txt("t")])]));
    expect(limparArvore(arvore)).toEqual(arvore);
  });
});
