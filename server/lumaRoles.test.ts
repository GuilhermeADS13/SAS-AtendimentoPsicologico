import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { answerSiteHelp } from "./ai/site-help";
import { buildNoClinicalDataResponse } from "./ai/llm";

describe("separação de papéis da Luma", () => {
  it("responde dúvidas de navegação sem acessar prontuários", () => {
    const response = answerSiteHelp("Como vejo minhas consultas?");

    expect(response.model).toBe("site-help-local");
    expect(response.topic).toBe("appointments");
    expect(response.content).toContain("Minhas Consultas");
    expect(response.content).not.toMatch(/prontu[aá]rio|diagn[oó]stico/i);
  });

  it("responde rapidamente quando não existem registros autorizados", () => {
    const response = buildNoClinicalDataResponse("Listar atividades para acompanhar a evolução");

    expect(response).toContain("Não encontrei registros clínicos autorizados");
    expect(response).toContain("não vou atribuir atividades específicas");
  });

  it("mantém o modo paciente fora do RAG clínico", () => {
    const source = readFileSync(new URL("../client/src/pages/Luma.tsx", import.meta.url), "utf8");

    expect(source).toContain("siteHelpMutation.mutateAsync");
    expect(source).toContain("if (!isTherapist)");
    expect(source).toContain("if (isAdmin)");
    expect(source).toContain("Acesso clínico restrito");
  });
});
