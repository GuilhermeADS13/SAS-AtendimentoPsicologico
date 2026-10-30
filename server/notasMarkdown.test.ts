import { describe, expect, it } from "vitest";
import {
  alternarAlinhamento,
  alternarLista,
  alternarMarca,
  alternarMarcaTexto,
  alternarPrefixo,
  alternarSublinhado,
  aplicarCor,
  continuarLista,
  diffMinimo,
  inserirLink,
  inserirModelo,
  inserirTabela,
  limparFormatacao,
  textoSemMarkdown,
} from "../shared/notasMarkdown";

/**
 * A barra de anotações da videochamada e do prontuário. Os casos aqui são os que
 * falhavam na versão anterior, que não tinha teste nenhum.
 */
describe("textoSemMarkdown (resumo do cartão da Evolução)", () => {
  it("tira as marcas e deixa o texto", () => {
    expect(textoSemMarkdown("**Evolução**\n\nPaciente *calma*, sono ~~ruim~~ <u>bom</u>.")).toBe(
      "Evolução\n\nPaciente calma, sono ruim bom.",
    );
  });

  it("títulos, citação, listas e tarefas", () => {
    expect(textoSemMarkdown("## Plano\n> observação\n- item um\n1. passo\n- [x] feito")).toBe(
      "Plano\nobservação\nitem um\npasso\nfeito",
    );
  });

  it("não come asterisco solto nem palavras com sublinhado", () => {
    expect(textoSemMarkdown("nota 5 * 2 e nome_do_arquivo")).toBe("nota 5 * 2 e nome_do_arquivo");
  });

  it("tira cor, marca-texto, alinhamento e link, que iriam crus para o PDF", () => {
    const md = '<div class="nota-centro">\n\n<span class="nota-cor-azul">azul</span> e <mark>forte</mark> em [site](https://a.com.br)\n\n</div>';
    expect(textoSemMarkdown(md)).toBe("azul e forte em site");
  });

  it("tabela vira linhas de texto, sem a grade", () => {
    expect(textoSemMarkdown("| Data | Humor |\n| --- | --- |\n| 10/10 | bom |")).toBe("Data · Humor\n10/10 · bom");
  });

  it("não mexe em texto com sinais de menor e maior", () => {
    expect(textoSemMarkdown("nota <5 e >2")).toBe("nota <5 e >2");
  });
});

describe("ferramentas novas da barra", () => {
  const azul = '<span class="nota-cor-azul">sono</span>';
  const verde = '<span class="nota-cor-verde">sono</span>';

  it("marca-texto alterna", () => {
    const r = alternarMarcaTexto("sono ruim", 0, 4);
    expect(r.texto).toBe("<mark>sono</mark> ruim");
    expect(alternarMarcaTexto(r.texto, r.inicio, r.fim).texto).toBe("sono ruim");
  });

  it("cor: pinta, deixa a palavra selecionada e troca sem empilhar", () => {
    const r = aplicarCor("sono bom", 0, 4, "azul");
    expect(r.texto).toBe(`${azul} bom`);
    expect(r.texto.slice(r.inicio, r.fim)).toBe("sono");
    expect(aplicarCor(r.texto, r.inicio, r.fim, "verde").texto).toBe(`${verde} bom`);
  });

  it("cor normal tira a cor, com a seleção dentro ou incluindo as etiquetas", () => {
    expect(aplicarCor(`${azul} bom`, azul.indexOf("sono"), azul.indexOf("sono") + 4, null).texto).toBe("sono bom");
    expect(aplicarCor(`${azul} bom`, 0, azul.length, null).texto).toBe("sono bom");
  });

  it("alinhamento: envolve a linha com as linhas em branco que o markdown exige", () => {
    const r = alternarAlinhamento("sono\nbom", 0, 2, "centro");
    expect(r.texto).toBe('<div class="nota-centro">\n\nsono\n\n</div>\n\nbom');
  });

  it("alinhamento: a linha seguinte fica separada, senão o markdown dela não é lido", () => {
    expect(alternarAlinhamento("a\n\nb", 0, 0, "direita").texto).toBe('<div class="nota-direita">\n\na\n\n</div>\n\nb');
  });

  it("alinhamento: repetir tira, escolher outro troca, e 'à esquerda' tira", () => {
    const r = alternarAlinhamento("sono", 0, 0, "centro");
    expect(alternarAlinhamento(r.texto, r.inicio, r.fim, "centro").texto).toBe("sono");
    expect(alternarAlinhamento(r.texto, r.inicio, r.fim, "direita").texto).toBe('<div class="nota-direita">\n\nsono\n\n</div>');
    expect(alternarAlinhamento(r.texto, r.inicio, r.fim, null).texto).toBe("sono");
  });

  it("link: envolve a seleção e seleciona o endereço para colar", () => {
    const r = inserirLink("veja isto", 5, 9);
    expect(r.texto).toBe("veja [isto](https://)");
    expect(r.texto.slice(r.inicio, r.fim)).toBe("https://");
  });

  it("tabela: em bloco próprio, depois da linha do cursor, com o título selecionado", () => {
    const r = inserirTabela("antes\ndepois", 2);
    expect(r.texto.startsWith("antes\n\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n")).toBe(true);
    expect(r.texto.endsWith("\ndepois")).toBe(true);
    expect(r.texto.slice(r.inicio, r.fim)).toBe("Coluna 1");
  });

  it("título: 'Texto normal' tira o prefixo de qualquer nível", () => {
    expect(alternarPrefixo("### Plano", 0, 0, "").texto).toBe("Plano");
    expect(alternarPrefixo("## Plano", 0, 0, "# ").texto).toBe("# Plano");
  });

  it("limpar: vale para a seleção, ou para a linha se ela estiver dentro das marcas", () => {
    expect(limparFormatacao("**a** e **b**", 0, 5).texto).toBe("a e **b**");
    expect(limparFormatacao("**forte** fim", 2, 7).texto).toBe("forte fim");
    expect(limparFormatacao("<mark>forte</mark>", 0, 0).texto).toBe("forte");
  });
});

describe("barra de anotações", () => {
  describe("negrito/itálico/tachado", () => {
    it("envolve a seleção", () => {
      const r = alternarMarca("paciente relata melhora", 0, 8, "**");
      expect(r.texto).toBe("**paciente** relata melhora");
      expect(r.texto.slice(r.inicio, r.fim)).toBe("paciente");
    });

    it("DESFAZ quando a seleção já está marcada (antes empilhava ****)", () => {
      expect(alternarMarca("**paciente** relata", 0, 12, "**").texto).toBe("paciente relata");
    });

    it("desfaz também quando as marcas estão fora da seleção", () => {
      expect(alternarMarca("**paciente** relata", 2, 10, "**").texto).toBe("paciente relata");
    });

    it("tachado usa a mesma regra", () => {
      expect(alternarMarca("meta antiga", 0, 11, "~~").texto).toBe("~~meta antiga~~");
    });

    it("sem seleção, deixa o cursor entre as marcas para já digitar", () => {
      const r = alternarMarca("", 0, 0, "**");
      expect(r.texto).toBe("****");
      expect(r.inicio).toBe(2);
    });
  });

  describe("sublinhado", () => {
    it("envolve a seleção com <u> (markdown não tem sublinhado)", () => {
      const r = alternarSublinhado("combinado com a paciente", 0, 9);
      expect(r.texto).toBe("<u>combinado</u> com a paciente");
      expect(r.texto.slice(r.inicio, r.fim)).toBe("combinado");
    });

    it("desfaz quando já está sublinhado", () => {
      expect(alternarSublinhado("<u>combinado</u> com", 0, 16).texto).toBe("combinado com");
    });

    it("desfaz com as marcas fora da seleção", () => {
      expect(alternarSublinhado("<u>combinado</u> com", 3, 12).texto).toBe("combinado com");
    });

    it("sem seleção, deixa o cursor dentro das marcas", () => {
      const r = alternarSublinhado("", 0, 0);
      expect(r.texto).toBe("<u></u>");
      expect(r.inicio).toBe(3);
    });
  });

  describe("listas", () => {
    it("marca TODAS as linhas selecionadas (antes só a primeira)", () => {
      const texto = "dormir melhor\nvoltar a caminhar\nligar para a mãe";
      expect(alternarLista(texto, 0, texto.length).texto).toBe(
        "- dormir melhor\n- voltar a caminhar\n- ligar para a mãe",
      );
    });

    it("desmarca quando todas já são itens", () => {
      const texto = "- dormir melhor\n- voltar a caminhar";
      expect(alternarLista(texto, 0, texto.length).texto).toBe("dormir melhor\nvoltar a caminhar");
    });

    it("numera em sequência", () => {
      const texto = "primeiro\nsegundo\nterceiro";
      expect(alternarLista(texto, 0, texto.length, "numerada").texto).toBe("1. primeiro\n2. segundo\n3. terceiro");
    });

    it("lista de tarefas sai com a caixa vazia", () => {
      expect(alternarLista("ligar para a escola", 0, 19, "tarefa").texto).toBe("- [ ] ligar para a escola");
    });

    it("TROCA de tipo em vez de empilhar marcadores", () => {
      const texto = "- um\n- dois";
      expect(alternarLista(texto, 0, texto.length, "numerada").texto).toBe("1. um\n2. dois");
    });

    it("marca só a linha do cursor quando não há seleção", () => {
      const texto = "primeira\nsegunda\nterceira";
      expect(alternarLista(texto, 10, 10).texto).toBe("primeira\n- segunda\nterceira");
    });

    it("no texto vazio, começa a lista", () => {
      expect(alternarLista("", 0, 0).texto).toBe("- ");
    });

    it("não mexe nas linhas de fora da seleção", () => {
      const texto = "titulo\nitem um\nitem dois\nrodape";
      const r = alternarLista(texto, texto.indexOf("item um"), texto.indexOf("item dois") + 4);
      expect(r.texto).toBe("titulo\n- item um\n- item dois\nrodape");
    });
  });

  describe("título e citação", () => {
    it("vira título", () => {
      expect(alternarPrefixo("Evolução", 0, 8, "## ").texto).toBe("## Evolução");
    });

    it("tira o título ao clicar de novo", () => {
      expect(alternarPrefixo("## Evolução", 0, 11, "## ").texto).toBe("Evolução");
    });

    it("citação para a fala do paciente", () => {
      expect(alternarPrefixo("não durmo desde março", 0, 21, "> ").texto).toBe("> não durmo desde março");
    });

    it("troca título por citação em vez de somar os dois", () => {
      expect(alternarPrefixo("## Evolução", 0, 11, "> ").texto).toBe("> Evolução");
    });
  });

  describe("Enter dentro da lista (como no Word e no Notion)", () => {
    it("continua a lista com marcador", () => {
      const texto = "- dormir melhor";
      const r = continuarLista(texto, texto.length);
      expect(r?.texto).toBe("- dormir melhor\n- ");
      expect(r?.inicio).toBe(texto.length + 3);
    });

    it("avança o número da lista numerada", () => {
      const texto = "1. primeiro\n2. segundo";
      expect(continuarLista(texto, texto.length)?.texto).toBe("1. primeiro\n2. segundo\n3. ");
    });

    it("na lista de tarefas, a próxima caixa nasce vazia", () => {
      const texto = "- [x] já liguei";
      expect(continuarLista(texto, texto.length)?.texto).toBe("- [x] já liguei\n- [ ] ");
    });

    it("mantém o recuo do item", () => {
      const texto = "  - sub-item";
      expect(continuarLista(texto, texto.length)?.texto).toBe("  - sub-item\n  - ");
    });

    it("item VAZIO encerra a lista em vez de criar marcador infinito", () => {
      const texto = "- feito\n- ";
      const r = continuarLista(texto, texto.length);
      expect(r?.texto).toBe("- feito\n");
    });

    it("fora de lista, não interfere (devolve null)", () => {
      expect(continuarLista("texto comum", 11)).toBeNull();
    });

    it("continua a citação", () => {
      expect(continuarLista("> fala do paciente", 18)?.texto).toBe("> fala do paciente\n> ");
    });
  });

  describe("modelos", () => {
    const SOAP = "**S — Subjetivo**\n\n\n**O — Objetivo**\n";

    it("entra numa linha nova, sem grudar no que já estava escrito", () => {
      expect(inserirModelo("paciente chegou atrasado", SOAP).texto).toBe(`paciente chegou atrasado\n\n${SOAP}`);
    });

    it("no vazio, não deixa linha em branco antes", () => {
      expect(inserirModelo("", SOAP).texto).toBe(SOAP);
    });

    it("deixa o cursor no primeiro campo do modelo, não no fim", () => {
      const r = inserirModelo("", SOAP);
      expect(r.texto.slice(0, r.inicio)).toBe("**S — Subjetivo**\n\n");
    });
  });

  describe("diffMinimo (mantém o Ctrl+Z funcionando)", () => {
    it("acha só o trecho que mudou", () => {
      expect(diffMinimo("paciente relata", "**paciente** relata")).toEqual({ de: 0, ate: 8, texto: "**paciente**" });
    });

    it("insere no meio sem reescrever o resto", () => {
      const d = diffMinimo("abc", "abXc");
      expect(d.texto).toBe("X");
      expect(d.de).toBe(2);
      expect(d.ate).toBe(2);
    });

    it("texto igual não gera troca", () => {
      expect(diffMinimo("igual", "igual")).toEqual({ de: 5, ate: 5, texto: "" });
    });
  });
});
