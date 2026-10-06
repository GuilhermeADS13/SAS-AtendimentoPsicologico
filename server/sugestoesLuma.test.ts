import { describe, expect, it } from "vitest";
import { QUANTAS_SUGESTOES, sugestoesDaVez } from "../shared/sugestoesLuma";

/**
 * As sugestões do Dashboard giram a cada visita (pedido do Guilherme: "fica
 * alternando toda vez que o usuário entra para novas ações"). O que não pode
 * acontecer é girar para pior: repetir o mesmo tema nas três, ou oferecer uma
 * pergunta que a Luma não responde sem paciente selecionado.
 */
describe("sugestões da Luma no Dashboard", () => {
  it("mostra sempre três", () => {
    for (let visita = 0; visita < 50; visita++) {
      expect(sugestoesDaVez(visita)).toHaveLength(QUANTAS_SUGESTOES);
    }
  });

  it("nunca repete a mesma pergunta na mesma visita", () => {
    for (let visita = 0; visita < 50; visita++) {
      const trio = sugestoesDaVez(visita);
      expect(new Set(trio).size).toBe(trio.length);
    }
  });

  /** O ponto do pedido: entrar de novo tem de mostrar coisa diferente. */
  it("troca o conjunto a cada visita seguida", () => {
    for (let visita = 0; visita < 50; visita++) {
      const agora = sugestoesDaVez(visita).join("|");
      const depois = sugestoesDaVez(visita + 1).join("|");
      expect(agora).not.toBe(depois);
    }
  });

  /** Três variações da mesma pergunta no mesmo cartão não ajudam ninguém. */
  it("não mostra três perguntas do mesmo assunto", () => {
    const assunto = (p: string) =>
      /agenda|atendo|próximo paciente/i.test(p) ? "agenda"
      : /sumido|sem retorno/i.test(p) ? "retorno"
      : /prontuário/i.test(p) ? "prontuario"
      : "financeiro";
    for (let visita = 0; visita < 50; visita++) {
      const assuntos = sugestoesDaVez(visita).map(assunto);
      expect(new Set(assuntos).size).toBe(QUANTAS_SUGESTOES);
    }
  });

  it("entrega as quatro áreas ao longo das visitas, não só duas", () => {
    const vistas = new Set<string>();
    for (let visita = 0; visita < 12; visita++) sugestoesDaVez(visita).forEach((p) => vistas.add(p));
    expect(vistas.size).toBeGreaterThanOrEqual(9);
  });

  it("aguenta entrada estranha sem quebrar", () => {
    for (const v of [0, -5, 1.7, Number.MAX_SAFE_INTEGER]) {
      const trio = sugestoesDaVez(v);
      expect(trio).toHaveLength(QUANTAS_SUGESTOES);
      expect(trio.every((p) => typeof p === "string" && p.length > 0)).toBe(true);
    }
  });
});
