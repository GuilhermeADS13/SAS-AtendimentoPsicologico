import { describe, expect, it } from "vitest";
import { MODELOS_INTERNOS, noteTemplateSchema } from "../shared/prontuario";

// Base de modelos de registro de sessão (2026-10-27). A espinha segue a
// Resolução CFP 001/2009, art. 2º: demanda e objetivos, evolução, encaminhamento
// ou encerramento.
describe("modelos de prontuário do sistema", () => {
  it("nomes únicos (o nome é a chave do botão e do item do menu)", () => {
    const nomes = MODELOS_INTERNOS.map((m) => m.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("cada modelo cabe no mesmo limite dos modelos da psicóloga", () => {
    for (const m of MODELOS_INTERNOS) {
      expect(noteTemplateSchema.safeParse({ id: m.nome, nome: m.nome, corpo: m.corpo }).success).toBe(true);
    }
  });

  it("SOAP e Evolução breve continuam como botões rápidos", () => {
    const rapidos = MODELOS_INTERNOS.filter((m) => m.grupo === "Rápidos").map((m) => m.nome);
    expect(rapidos).toEqual(["SOAP", "Evolução breve"]);
  });

  it("cobre o que o CFP pede: demanda e objetivos, evolução, encaminhamento e encerramento", () => {
    const corpo = (nome: string) => MODELOS_INTERNOS.find((m) => m.nome === nome)?.corpo ?? "";
    expect(corpo("Primeira sessão")).toMatch(/Avaliação da demanda/);
    expect(corpo("Primeira sessão")).toMatch(/Objetivos combinados/);
    expect(corpo("Encaminhamento")).toMatch(/Encaminhado para/);
    expect(corpo("Encerramento / alta")).toMatch(/Motivo do encerramento/);
    // Casal/família: lembra da documentação individual (art. 5º, III).
    expect(corpo("Casal / família")).toMatch(/prontuário individual/);
  });

  it("o de risco traz os contatos de emergência", () => {
    const risco = MODELOS_INTERNOS.find((m) => m.nome === "Avaliação de risco")?.corpo ?? "";
    expect(risco).toMatch(/CVV 188/);
    expect(risco).toMatch(/SAMU 192/);
  });
});
