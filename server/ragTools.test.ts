import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt } from "./ai/llm";
import { formatRagContext, type RagSource } from "./ai/rag";

const therapistContext = {
  userId: 10,
  role: "therapist" as const,
  therapistId: 7,
};

describe("RAG e ferramentas clínicas", () => {
  it("mantém as restrições clínicas e o escopo do paciente no prompt (com ferramentas)", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42);
    expect(prompt).toContain("Você é Luma, uma coruja virtual acolhedora");
    expect(prompt).toContain("metáforas de coruja apenas de forma leve");
    expect(prompt).toContain("Não faça diagnóstico");
    expect(prompt).toContain("somente de leitura");
    expect(prompt).toContain("patientId 42");
    expect(prompt).toContain("Não revele");
  });

  it("no modo sem ferramentas, corta capacidades de escrita e o acesso a prontuários", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42, false);
    // O modo read-only (kill-switch / RAG desligado) precisa dizer que NÃO há
    // acesso clínico e não pode oferecer as ações de escrita.
    expect(prompt).toContain("NÃO tem acesso a prontuários");
    expect(prompt).toContain("Nunca altere, exclua ou crie prontuários.");
    expect(prompt).not.toContain("Suas capacidades:");
    expect(prompt).not.toContain("somente com confirmação explícita");
    // Ainda sem acesso, o escopo do paciente continua marcado — sem inventar dados.
    expect(prompt).toContain("patientId 42");
  });

  it("formata a fonte com o cabeçalho legível e sem despejar campos internos", () => {
    const context = formatRagContext([
      {
        sourceType: "session",
        sourceId: 9,
        patientId: 42,
        text: "Registro autorizado",
        score: 0.91,
        requiresReview: false,
      },
    ]);
    expect(context).toBe("[Fonte 1 | session 9 | paciente 42]\nRegistro autorizado");
    // Só o cabeçalho legível + o texto devem sair. Se alguém trocar o formatador
    // por um JSON.stringify da fonte, campos internos vazariam para o modelo —
    // esta trava pega isso (`requiresReview`/`sourceType` não são texto do prompt).
    expect(context).not.toContain("requiresReview");
    expect(context).not.toContain("sourceType");
  });

  it("numera e separa múltiplas fontes", () => {
    const fontes: RagSource[] = [
      { sourceType: "session", sourceId: 9, patientId: 42, text: "Primeira", requiresReview: false },
      { sourceType: "document", sourceId: 5, patientId: 42, text: "Segunda", requiresReview: false },
    ];
    const context = formatRagContext(fontes);
    expect(context).toContain("[Fonte 1 | session 9 | paciente 42]");
    expect(context).toContain("[Fonte 2 | document 5 | paciente 42]");
    // Fontes separadas por linha em branco, na ordem recebida.
    expect(context.indexOf("Fonte 1")).toBeLessThan(context.indexOf("Fonte 2"));
    expect(context).toContain("Primeira\n\n[Fonte 2");
  });

  it("não produz contexto quando o retriever não encontra fontes", () => {
    expect(formatRagContext([])).toBe("");
  });
});
