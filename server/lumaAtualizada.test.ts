import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt, pareceNavegacao } from "./ai/llm";
import { answerSiteHelp } from "./ai/site-help";

const psicologa = { userId: 7, role: "therapist" as const, therapistId: 3 };

describe("Luma do paciente conhece Meus documentos", () => {
  it.each([
    "onde vejo meu laudo?",
    "como baixo o atestado?",
    "o laudo que minha psicóloga mandou não aparece",
    "onde fica o arquivo da declaração?",
  ])("%s", (pergunta) => {
    const r = answerSiteHelp(pergunta);
    expect(r.topic).toBe("documentos");
    expect(r.content).toContain("Meus documentos");
  });

  it("mandar um documento para a psicóloga continua em Mensagens", () => {
    expect(answerSiteHelp("como envio um documento para ela?").topic).toBe("mensagens");
  });

  it("o menu geral cita Meus documentos", () => {
    expect(answerSiteHelp("oi").content).toContain("Meus documentos");
  });
});

describe("Luma da psicóloga conhece as funções novas", () => {
  const navegacao = clinicalSystemPrompt(psicologa, undefined, true, undefined, { navegacao: true });

  it.each([
    ["documentos compartilhados", "'Compartilhar' libera um por vez"],
    ["contrato do modelo dela", "'Meu modelo'"],
    ["aparelho novo", "Lembrar deste dispositivo por 30 dias"],
    ["relógio da chamada", "pisca em vermelho"],
  ])("%s", (_nome, trecho) => {
    expect(navegacao).toContain(trecho);
  });

  it("recusa escrever documento, mas explica como compartilhar o arquivo", () => {
    const prompt = clinicalSystemPrompt(psicologa, undefined, true, undefined, { documentos: true });
    expect(prompt).toContain("compartilhar o arquivo com o paciente é uso do sistema");
  });

  it.each(["como compartilho o laudo com o paciente?", "como baixo em Word?", "como gero o contrato?"])(
    "'%s' é pergunta de uso do sistema",
    (pergunta) => expect(pareceNavegacao(pergunta)).toBe(true),
  );
});
