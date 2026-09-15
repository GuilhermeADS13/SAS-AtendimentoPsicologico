import { describe, expect, it } from "vitest";
import {
  ANAMNESE_CAMPOS,
  SOAP_CAMPOS,
  agruparCampos,
  anamneseSchema,
  tcleSchema,
} from "@shared/prontuario";

/**
 * O prontuário (anamnese/TCLE/SOAP) é a fonte única lida pelo formulário, pela
 * validação no servidor e pela exportação. Aqui garantimos que a validação aceita
 * preenchimento PARCIAL (o profissional completa aos poucos), rejeita chaves
 * desconhecidas (não vira depósito de lixo) e que o agrupamento não perde campos.
 */
describe("prontuário — validação e configuração", () => {
  it("aceita anamnese parcial com chaves conhecidas", () => {
    const r = anamneseSchema.safeParse({ queixaPrincipal: "Ansiedade", historiaDeVida: "..." });
    expect(r.success).toBe(true);
  });

  it("rejeita chave desconhecida na anamnese", () => {
    expect(anamneseSchema.safeParse({ chaveInventada: "x" }).success).toBe(false);
  });

  it("rejeita valor que não é texto", () => {
    expect(anamneseSchema.safeParse({ queixaPrincipal: 123 }).success).toBe(false);
  });

  it("aceita TCLE parcial e rejeita chave desconhecida", () => {
    expect(tcleSchema.safeParse({ valorSessao: "R$ 150,00" }).success).toBe(true);
    expect(tcleSchema.safeParse({ naoExiste: "y" }).success).toBe(false);
  });

  it("agruparCampos preserva a ordem e não perde campos", () => {
    const grupos = agruparCampos(ANAMNESE_CAMPOS);
    const total = grupos.reduce((n, g) => n + g.campos.length, 0);
    expect(total).toBe(ANAMNESE_CAMPOS.length);
    // Cada grupo aparece uma única vez.
    expect(new Set(grupos.map((g) => g.grupo)).size).toBe(grupos.length);
  });

  it("SOAP tem exatamente S, O, A, P na ordem", () => {
    expect(SOAP_CAMPOS.map((c) => c.chave)).toEqual([
      "subjective",
      "objective",
      "assessment",
      "plan",
    ]);
  });
});
