import { describe, expect, it } from "vitest";
import { contemTodos, dobrar, recorteDoResultado, termosDaBusca, trechosDestacados } from "../shared/buscaTexto";

/** A busca da conversa (Mensagens), que filtra a cada letra como o WhatsApp. */
describe("busca nas mensagens", () => {
  it("ignora acento e maiúscula sem mudar o comprimento do texto", () => {
    expect(dobrar("Sessão Às 15h")).toBe("sessao as 15h");
    expect(dobrar("Sessão Às 15h")).toHaveLength("Sessão Às 15h".length);
  });

  it("uma letra já filtra", () => {
    const termos = termosDaBusca("s");
    expect(contemTodos("Sessão amanhã", termos)).toBe(true);
    expect(contemTodos("Bom dia", termos)).toBe(false);
  });

  it("acha com ou sem acento, nos dois sentidos", () => {
    expect(contemTodos("Confirmo a sessão", termosDaBusca("sessao"))).toBe(true);
    expect(contemTodos("Confirmo a sessao", termosDaBusca("sessão"))).toBe(true);
  });

  it("vários termos: a mensagem precisa ter TODOS, em qualquer ordem", () => {
    const termos = termosDaBusca("amanhã sessão");
    expect(contemTodos("A sessão de amanhã", termos)).toBe(true);
    expect(contemTodos("A sessão de hoje", termos)).toBe(false);
  });

  it("busca vazia não filtra nada", () => {
    expect(termosDaBusca("   ")).toEqual([]);
    expect(contemTodos("qualquer", [])).toBe(true);
  });

  it("destaca no texto ORIGINAL, com acento e caixa preservados", () => {
    expect(trechosDestacados("Confirmo a Sessão", termosDaBusca("sessao"))).toEqual([
      { texto: "Confirmo a ", destaque: false },
      { texto: "Sessão", destaque: true },
    ]);
  });

  it("destaca todas as ocorrências", () => {
    const r = trechosDestacados("ana e Ana", termosDaBusca("ana"));
    expect(r.filter((t) => t.destaque).map((t) => t.texto)).toEqual(["ana", "Ana"]);
  });

  it("termos que se sobrepõem viram um destaque só", () => {
    expect(trechosDestacados("natana", termosDaBusca("nat ana"))).toEqual([{ texto: "natana", destaque: true }]);
  });

  describe("linha da lista de resultados", () => {
    it("mensagem curta fica inteira, numa linha só", () => {
      expect(recorteDoResultado("Bom dia,\namor", termosDaBusca("amor"))).toBe("Bom dia, amor");
    });

    it("termo lá no fim: começa perto dele, com reticências, sem cortar palavra", () => {
      const texto = "Tô arrumando minhas coisas para amanhã e depois vou dormir cedo porque a sessão é às oito";
      const r = recorteDoResultado(texto, termosDaBusca("sessao"));
      expect(r.startsWith("…")).toBe(true);
      expect(r).toContain("sessão");
      expect(r.length).toBeLessThan(texto.length);
      expect(texto).toContain(r.slice(1)); // começou numa palavra inteira
      expect(r.slice(1, 2)).not.toBe(" ");
    });
  });

  it("caractere especial na busca não quebra (não é regex)", () => {
    expect(contemTodos("custa R$ 150 (pix)", termosDaBusca("(pix"))).toBe(true);
  });
});
