import { describe, expect, it } from "vitest";
import { alternarLista, alternarMarca, inserirModelo } from "../shared/notasMarkdown";

/**
 * A barra de anotações da videochamada. Os casos aqui são os que falhavam na
 * versão anterior, que não tinha teste nenhum.
 */
describe("barra de anotações", () => {
  describe("negrito/itálico", () => {
    it("envolve a seleção", () => {
      const r = alternarMarca("paciente relata melhora", 0, 8, "**");
      expect(r.texto).toBe("**paciente** relata melhora");
      expect(r.texto.slice(r.inicio, r.fim)).toBe("paciente");
    });

    it("DESFAZ quando a seleção já está marcada (antes empilhava ****)", () => {
      const r = alternarMarca("**paciente** relata", 0, 12, "**");
      expect(r.texto).toBe("paciente relata");
    });

    it("desfaz também quando as marcas estão fora da seleção", () => {
      const r = alternarMarca("**paciente** relata", 2, 10, "**");
      expect(r.texto).toBe("paciente relata");
    });

    it("sem seleção, deixa o cursor entre as marcas para já digitar", () => {
      const r = alternarMarca("", 0, 0, "**");
      expect(r.texto).toBe("****");
      expect(r.inicio).toBe(2);
      expect(r.fim).toBe(2);
    });
  });

  describe("lista", () => {
    it("marca TODAS as linhas selecionadas (antes só a primeira)", () => {
      const texto = "dormir melhor\nvoltar a caminhar\nligar para a mãe";
      const r = alternarLista(texto, 0, texto.length);
      expect(r.texto).toBe("- dormir melhor\n- voltar a caminhar\n- ligar para a mãe");
    });

    it("desmarca quando todas já são itens", () => {
      const texto = "- dormir melhor\n- voltar a caminhar";
      const r = alternarLista(texto, 0, texto.length);
      expect(r.texto).toBe("dormir melhor\nvoltar a caminhar");
    });

    it("marca só a linha do cursor quando não há seleção", () => {
      const texto = "primeira\nsegunda\nterceira";
      const r = alternarLista(texto, 10, 10); // dentro de "segunda"
      expect(r.texto).toBe("primeira\n- segunda\nterceira");
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

  describe("modelos", () => {
    const SOAP = "**S — Subjetivo**\n\n\n**O — Objetivo**\n";

    it("entra numa linha nova, sem grudar no que já estava escrito", () => {
      const r = inserirModelo("paciente chegou atrasado", SOAP);
      expect(r.texto).toBe(`paciente chegou atrasado\n\n${SOAP}`);
    });

    it("no vazio, não deixa linha em branco antes", () => {
      expect(inserirModelo("", SOAP).texto).toBe(SOAP);
    });

    it("deixa o cursor no primeiro campo do modelo, não no fim", () => {
      const r = inserirModelo("", SOAP);
      expect(r.inicio).toBeLessThan(r.texto.length);
      expect(r.texto.slice(0, r.inicio)).toBe("**S — Subjetivo**\n\n");
    });
  });
});
