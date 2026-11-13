/**
 * A Luma precisa saber das funções novas (2026-11): sem isto no mapa, ela responde
 * "não existe" ou inventa o caminho. Vale para a Luma da psicóloga (instruções do
 * modelo) e para a do paciente (respostas prontas, por palavra-chave).
 */
import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt, pareceNavegacao } from "./ai/llm";
import { answerSiteHelp } from "./ai/site-help";

const psicologa = { userId: 7, role: "therapist" as const, therapistId: 11 };

describe("Luma da psicóloga conhece as funções de novembro", () => {
  const mapa = clinicalSystemPrompt(psicologa, undefined, true, undefined, { navegacao: true });

  it.each([
    ["recibo", /Gerar recibo/],
    ["editar o recibo", /Ver e editar/],
    ["importar planilha", /Importar planilha/],
    ["lista de espera", /Lista de espera/],
    ["horário livre", /Horário livre/],
    ["instalar o app", /Instalar o app/],
    ["aparecer na busca", /Aparecer na busca de pacientes/],
  ])("%s", (_nome, texto) => {
    expect(mapa).toMatch(texto);
  });

  it("as perguntas sobre elas trazem o mapa", () => {
    for (const pergunta of [
      "como gero o recibo?",
      "tem lista de espera?",
      "como importo a planilha?",
      "como instalo o app?",
      "quero aparecer na busca",
      "dá para conseguir novos pacientes por aqui?",
    ]) {
      expect(pareceNavegacao(pergunta), pergunta).toBe(true);
    }
  });
});

describe("Luma do paciente", () => {
  it("recibo: quem emite é a psicóloga", () => {
    for (const pergunta of ["como peço recibo para o imposto de renda?", "quero o recibo do que paguei"]) {
      const r = answerSiteHelp(pergunta);
      expect(r.topic, pergunta).toBe("receipt");
      expect(r.content).toContain("Mensagens");
    }
  });

  it("instalar o app", () => {
    for (const pergunta of ["como instalo o app?", "tem aplicativo para baixar?", "dá para colocar na tela inicial do celular?"]) {
      const r = answerSiteHelp(pergunta);
      expect(r.topic, pergunta).toBe("app");
      expect(r.content).toContain("Instalar o app");
    }
  });

  it("encontrar uma psicóloga", () => {
    for (const pergunta of [
      "não tenho psicóloga, como encontro uma?",
      "quero achar um psicólogo",
      "a primeira conversa é paga?",
      "como cancelo meu pedido?",
    ]) {
      const r = answerSiteHelp(pergunta);
      expect(r.topic, pergunta).toBe("encontrar");
      expect(r.content).toContain("Encontrar uma psicóloga");
    }
    // Quem já tem psicóloga continua indo para "Minha Psicóloga" e para a agenda.
    expect(answerSiteHelp("onde vejo minha psicóloga?").topic).toBe("therapist");
    expect(answerSiteHelp("quero cancelar a consulta de amanhã").topic).toBe("reschedule");
  });

  it("não confunde com outros assuntos", () => {
    expect(answerSiteHelp("como faço para ir para a sala?").topic).toBe("video");
    expect(answerSiteHelp("o app não abre a câmera").topic).toBe("video");
    expect(answerSiteHelp("como pago a consulta?").topic).toBe("payments");
  });
});
