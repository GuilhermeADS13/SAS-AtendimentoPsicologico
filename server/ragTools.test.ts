import { describe, expect, it } from "vitest";
import { clinicalSystemPrompt } from "./ai/llm";
import { escolherCandidatos, formatRagContext, type RagSource } from "./ai/rag";
import { avaliarSumico, createClinicalTools } from "./ai/clinical-tools";

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
/**
 * Prontuário: o gargalo não é campo faltando (a Resolução CFP 001/2009 já está
 * coberta pelo schema), é a fricção de digitar. A Luma ajuda a RASCUNHAR no formato
 * da própria profissional — mas nunca salva, e nunca completa o que ela não disse.
 */
/**
 * Custo do prompt: cada pergunta reenvia o prompt INTEIRO, e o plano free da Groq da
 * 8000 tokens/minuto. Com o prompt cheio (~2900 tokens) a segunda pergunta do minuto
 * voltava 429 -- foi o que bloqueou a validacao em producao. Os blocos pesados (mapa
 * do menu com passo a passo, protocolo de escrita na agenda, regra de encerramento)
 * agora so entram quando a pergunta e daquele tipo.
 */
/**
 * "Quem sumiu" tem peso clinico: abandono de tratamento passa despercebido quando a
 * agenda esta cheia. Mas alarme falso desgasta a confianca na ferramenta -- por isso
 * o caso do paciente recem-cadastrado importa tanto quanto o do que sumiu de vdd.
 */
describe("avaliarSumico", () => {
  const DIA = 86400000;
  const agora = Date.parse("2026-09-29T12:00:00Z");
  const corte = agora - 30 * DIA; // 30 dias sem consulta
  const dias = (n: number) => new Date(agora - n * DIA);

  it("sumiu: ultima consulta muito antiga e nada marcado", () => {
    const r = avaliarSumico([{ scheduledAt: dias(90), status: "completed" }], dias(200), agora, corte);
    expect(r.sumiu).toBe(true);
    expect(r.nuncaTeveConsulta).toBe(false);
  });

  it("NAO sumiu: tem consulta futura marcada (o vinculo está ativo)", () => {
    const r = avaliarSumico(
      [{ scheduledAt: dias(90), status: "completed" }, { scheduledAt: dias(-3), status: "scheduled" }],
      dias(200), agora, corte,
    );
    expect(r.sumiu).toBe(false);
  });

  it("NAO sumiu: veio faz pouco tempo", () => {
    expect(avaliarSumico([{ scheduledAt: dias(5), status: "completed" }], dias(200), agora, corte).sumiu).toBe(false);
  });

  /**
   * O falso positivo que a validacao em producao revelou: sem nenhuma consulta, a
   * regra caia direto no "sumiu" e marcava quem tinha acabado de ser cadastrado.
   */
  it("NAO sumiu: cadastrado agora e ainda sem a primeira consulta marcada", () => {
    const r = avaliarSumico([], dias(1), agora, corte);
    expect(r.sumiu).toBe(false);
    expect(r.nuncaTeveConsulta).toBe(true);
  });

  it("sumiu: cadastrado ha muito tempo e NUNCA marcou a primeira consulta", () => {
    const r = avaliarSumico([], dias(120), agora, corte);
    expect(r.sumiu).toBe(true);
    expect(r.nuncaTeveConsulta).toBe(true);
  });
});

describe("foco do prompt (custo por pergunta)", () => {
  const prompt = (foco?: Parameters<typeof clinicalSystemPrompt>[4]) =>
    clinicalSystemPrompt(therapistContext, 5, true, "Fulana", foco);
  const semNada = { navegacao: false, acaoDeAgenda: false, gestao: false };

  it("sem foco declarado manda tudo (nenhum chamador antigo perde instrução)", () => {
    const completo = prompt();
    expect(completo).toContain("codigoConfirmacao");
    expect(completo).toContain("ENCERRAMENTO:");
  });

  it("pergunta comum fica bem menor que o prompt completo", () => {
    expect(prompt(semNada).length).toBeLessThan(prompt().length * 0.7);
  });

  it("só manda o passo a passo do menu em pergunta de navegação", () => {
    expect(prompt(semNada)).not.toContain("Novo Paciente' > preencher");
    expect(prompt({ navegacao: true })).toContain("Novo Paciente' > preencher");
  });

  it("só manda o protocolo de escrita quando há ação de agenda", () => {
    expect(prompt(semNada)).not.toContain("codigoConfirmacao");
    expect(prompt({ acaoDeAgenda: true })).toContain("codigoConfirmacao");
  });

  /**
   * A parte que NAO pode encolher. O mapa curto fica sempre porque o detector de
   * navegacao ja nos escapou duas vezes ("como coloco meu prontuario", "quais
   * prontuarios estao incompletos") -- se ele falhar, a Luma ainda sabe nomear a
   * tela em vez de recusar ou dizer que nao encontrou registros.
   */
  it("nunca corta segurança, escopo nem o mapa curto do menu", () => {
    const minimo = prompt(semNada);
    expect(minimo).toContain("Menu da profissional:");
    expect(minimo).toContain("navegação não depende do prontuário");
    expect(minimo).toContain("CVV 188");
    expect(minimo).toContain("ESCOPO TRANCADO");
    expect(minimo).toContain("Não faça diagnóstico");
  });
});

describe("apoio ao prontuário (rascunho e encerramento)", () => {
  const prompt = (role: "therapist" | "patient") =>
    clinicalSystemPrompt(
      role === "therapist"
        ? therapistContext
        : { userId: 20, role: "patient" as const, patientId: 3 },
      role === "therapist" ? undefined : 3,
      true,
    );

  it("orienta a devolver rascunho no formato DA PROFISSIONAL, com SOAP só de reserva", () => {
    const p = prompt("therapist");
    expect(p).toContain("RASCUNHO DE PRONTUÁRIO");
    expect(p).toContain("formato DELA");
    expect(p).toMatch(/só use SOAP/i);
  });

  it("proíbe a Luma de completar o que a profissional não disse e de salvar sozinha", () => {
    const p = prompt("therapist");
    expect(p).toMatch(/não complete, não interprete/i);
    expect(p).toContain("você NÃO salva prontuário");
  });

  it("oferece registrar o encerramento de quem sumiu (exigência do CFP)", () => {
    const p = prompt("therapist");
    expect(p).toContain("ENCERRAMENTO:");
    expect(p).toContain("encerramentoRegistrado");
    expect(p).toMatch(/quem salva é ela/i);
  });

  // O paciente não tem prontuário para rascunhar nem pacientes para encerrar: essas
  // regras são só ruído (e confusão de papel) no modo dele.
  it("não vaza as regras de prontuário para o modo paciente", () => {
    const p = prompt("patient");
    expect(p).not.toContain("RASCUNHO DE PRONTUÁRIO");
    expect(p).not.toContain("ENCERRAMENTO:");
  });
});

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

/**
 * Custo das FERRAMENTAS. Com function calling, o schema de todas elas vai junto em
 * TODA requisicao, somado ao prompt. As 4 de escrita tem os maiores schemas do
 * conjunto (e repetem o texto do codigoConfirmacao em cada uma): medindo, custavam
 * mais que as 9 de leitura juntas. Numa pergunta de leitura elas nao servem para
 * nada, e no plano free da Groq (8000 tokens/min) isso e a diferenca entre caber
 * uma ou duas perguntas por minuto.
 */
describe("ferramentas enviadas por pergunta", () => {
  const ctx = { userId: 1, role: "therapist" as const, therapistId: 7 };
  const db = {} as never;
  const nomes = (incluirEscrita: boolean) =>
    (createClinicalTools(ctx, db, undefined, "t", undefined, incluirEscrita) as Array<{ name: string }>)
      .map((t) => t.name);

  const ESCRITA = ["agendar_consulta", "remarcar_consulta", "cancelar_consulta", "registrar_pagamento"];

  it("pergunta de LEITURA nao carrega as ferramentas de escrita", () => {
    const enviadas = nomes(false);
    for (const escrita of ESCRITA) expect(enviadas).not.toContain(escrita);
  });

  it("pedido de ACAO na agenda carrega as de escrita", () => {
    const enviadas = nomes(true);
    for (const escrita of ESCRITA) expect(enviadas).toContain(escrita);
  });

  /**
   * O que NAO pode sumir junto: sem as leituras, a Luma nao responde nada util --
   * seria trocar custo por uma assistente muda.
   */
  it("as leituras continuam em qualquer caso", () => {
    for (const incluirEscrita of [true, false]) {
      const enviadas = nomes(incluirEscrita);
      expect(enviadas).toContain("get_minha_agenda");
      expect(enviadas).toContain("get_patient_sessions");
      expect(enviadas).toContain("search_patient_records");
    }
  });

  it("por padrao (sem informar) manda tudo, como antes", () => {
    const padrao = (createClinicalTools(ctx, db, undefined, "t") as Array<{ name: string }>).map((t) => t.name);
    for (const escrita of ESCRITA) expect(padrao).toContain(escrita);
  });
});
