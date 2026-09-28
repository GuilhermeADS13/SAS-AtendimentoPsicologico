import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt } from "./ai/llm";
import { escolherCandidatos, formatRagContext, type RagSource } from "./ai/rag";

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

  it("traz o backstop de crise no prompt (CVV 188 / SAMU 192), nos dois modos", () => {
    for (const toolsEnabled of [true, false]) {
      const prompt = clinicalSystemPrompt(therapistContext, 42, toolsEnabled);
      expect(prompt).toMatch(/SEGURANÇA \(crise\)/);
      expect(prompt).toContain("188");
      expect(prompt).toContain("192");
    }
  });

  it("uso do sistema é escopo: orienta e não recusa (com mapa do menu)", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42);
    expect(prompt).toContain("USO DO SISTEMA é escopo (3)");
    expect(prompt).toMatch(/NUNCA recuse/);
    expect(prompt).toContain("Novo Paciente");
    expect(prompt).toContain("Ajuda");
  });

  it("tranca o escopo: recusa assuntos fora do sistema, nos dois modos", () => {
    for (const toolsEnabled of [true, false]) {
      const prompt = clinicalSystemPrompt(therapistContext, 42, toolsEnabled);
      expect(prompt).toContain("ESCOPO TRANCADO");
      expect(prompt).toContain("FORA do escopo");
      // A instrução precisa mandar NÃO responder o off-topic (ex.: matemática).
      expect(prompt).toContain("quanto é 1+1");
      expect(prompt).toMatch(/NÃO responda/);
    }
  });

  it("não expõe nomes técnicos de ferramentas ao listar capacidades", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42);
    expect(prompt).toContain("LINGUAGEM NATURAL");
    expect(prompt).toMatch(/NUNCA cite nomes técnicos de ferramentas/);
  });

  it("regra de valor: informa se definido, senão redireciona à psicóloga (sem inventar)", () => {
    const prompt = clinicalSystemPrompt(therapistContext, 42);
    expect(prompt).toContain("VALOR de consulta");
    expect(prompt).toMatch(/NUNCA invente/);
    expect(prompt).toContain("psicologoResponsavel");
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

/**
 * Antes, a busca trazia os registros com `.limit(100)` por DATA. Dois problemas: o
 * que estivesse além dos 100 mais recentes era INVISÍVEL para a Luma (com terapia
 * semanal, cerca de 2 anos de histórico, enquanto o prontuário tem guarda de 5
 * anos), e ainda assim os 100 inteiros iam para o índice — sem cache de embedding,
 * cada um custa uma chamada ao provedor por pergunta.
 */
describe("escolha de candidatos para o índice (alcance x custo)", () => {
  // 300 sessões, da mais nova para a mais antiga, como vem do banco.
  const sessoes = Array.from({ length: 300 }, (_, i) => ({
    id: i,
    texto: i === 250 ? "Paciente relata crises de pânico no trabalho" : `Sessão comum número ${i}`,
  }));
  const textoDe = (s: { texto: string }) => s.texto;
  const limites = { recentes: 40, porTexto: 30 };

  it("acha um registro ANTIGO que casa com a pergunta (o ponto cego do limit por data)", () => {
    const escolhidos = escolherCandidatos(sessoes, textoDe, "quando começaram as crises de pânico?", limites);
    // A sessão 250 está muito além dos 100 mais recentes: antes, invisível.
    expect(escolhidos.map(s => s.id)).toContain(250);
  });

  it("mantém os mais recentes sempre, mesmo quando não casam com a pergunta", () => {
    const escolhidos = escolherCandidatos(sessoes, textoDe, "crises de pânico", limites);
    for (const esperado of [0, 1, 39]) expect(escolhidos.map(s => s.id)).toContain(esperado);
  });

  it("respeita o teto por pista (custo de embedding por pergunta)", () => {
    const escolhidos = escolherCandidatos(sessoes, textoDe, "sessão comum", limites);
    expect(escolhidos.length).toBeLessThanOrEqual(limites.recentes + limites.porTexto);
  });

  it("devolve tudo quando o histórico é menor que os tetos (caso comum)", () => {
    const poucas = sessoes.slice(0, 12);
    expect(escolherCandidatos(poucas, textoDe, "qualquer coisa", limites)).toHaveLength(12);
  });

  it("sem palavra útil na pergunta, cai só nos recentes (não devolve histórico inteiro)", () => {
    const escolhidos = escolherCandidatos(sessoes, textoDe, "e?", limites);
    expect(escolhidos).toHaveLength(limites.recentes);
  });
});
