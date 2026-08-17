import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { answerSiteHelp } from "./ai/site-help";
import { buildGeneralActivityResponse, buildNoClinicalDataResponse } from "./ai/llm";
import { isLumaTestAccount } from "../client/src/lib/lumaAccess";

describe("separação de papéis da Luma", () => {
  it("restringe a conta de demonstração ao e-mail autorizado", () => {
    expect(isLumaTestAccount("guilhermeads13@outlook.com")).toBe(true);
    expect(isLumaTestAccount("outra-conta@example.com")).toBe(false);
    expect(isLumaTestAccount(" GUILHERMEADS13@OUTLOOK.COM ")).toBe(true);
  });

  it("responde dúvidas de navegação sem acessar prontuários", () => {
    const response = answerSiteHelp("Como vejo minhas consultas?");

    expect(response.model).toBe("site-help-local");
    expect(response.topic).toBe("appointments");
    expect(response.content).toContain("Minhas Consultas");
    expect(response.content).not.toMatch(/prontu[aá]rio|diagn[oó]stico/i);
  });

  it("responde sugestões de atividades sem depender do modelo", () => {
    const response = buildGeneralActivityResponse();

    expect(response).toContain("Registrar mudanças percebidas");
    expect(response).toContain("revisadas pela profissional responsável");
  });

  it("responde rapidamente quando não existem registros autorizados", () => {
    const response = buildNoClinicalDataResponse("Listar atividades para acompanhar a evolução");

    expect(response).toContain("Não encontrei registros clínicos autorizados");
    expect(response).toContain("não vou atribuir atividades específicas");
  });

  it("mantém o modo paciente fora do RAG clínico", () => {
    const source = readFileSync(new URL("../client/src/pages/Luma.tsx", import.meta.url), "utf8");

    expect(source).toContain("siteHelpMutation.mutateAsync");
    expect(source).toContain("if (!isClinicalUser)");
    expect(source).toContain("if (isAdmin)");
    expect(source).toContain("Acesso clínico restrito");
    expect(source).toContain("isTestSiteSupport");
    expect(source).toContain("siteHelpMutation.mutateAsync");
    expect(source).not.toContain("chatMutation.mutateAsync({ messages: nextMessages");
    expect(source).toContain("Pergunte sobre os registros autorizados deste paciente");
    expect(source).not.toContain('placeholder="Escreva uma pergunta sobre o uso do site..."');
  });
});
