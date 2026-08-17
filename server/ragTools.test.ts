import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt } from "./ai/llm";
import { formatRagContext } from "./ai/rag";

const therapistContext = {
  userId: 10,
  role: "therapist" as const,
  therapistId: 7,
};

describe("RAG e ferramentas clínicas", () => {
  it("mantém as restrições clínicas e o escopo do paciente no prompt", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42);
    expect(prompt).toContain("Você é Luma, uma coruja virtual acolhedora");
    expect(prompt).toContain("metáforas de coruja apenas de forma leve");
    expect(prompt).toContain("Não faça diagnóstico");
    expect(prompt).toContain("somente de leitura");
    expect(prompt).toContain("patientId 42");
    expect(prompt).toContain("Não revele");
  });

  it("formata somente fontes retornadas pelo retriever", () => {
    const context = formatRagContext([
      {
        sourceType: "session",
        sourceId: 9,
        patientId: 42,
        text: "Registro autorizado",
        score: 0.91,
      },
    ]);
    expect(context).toContain("Fonte 1");
    expect(context).toContain("session 9");
    expect(context).toContain("paciente 42");
    expect(context).toContain("Registro autorizado");
    expect(context).not.toContain("fileUrl");
  });

  it("não produz contexto quando o retriever não encontra fontes", () => {
    expect(formatRagContext([])).toBe("");
  });
});
