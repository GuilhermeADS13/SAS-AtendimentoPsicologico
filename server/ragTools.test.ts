import { describe, expect, it } from "vitest";
import {
  buildSoEstruturaResponse,
  clinicalSystemPrompt,
  pareceAssuntoDeProntuario,
  pareceDocumentoPsicologico,
  pedeRelatorioDaClinica,
} from "./ai/llm";
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
    expect(prompt).toContain("Você não lê nem altera prontuários");
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
    expect(prompt).toContain("Você não lê nem altera prontuários.");
    expect(prompt).not.toContain("Suas capacidades:");
    expect(prompt).not.toContain("somente com confirmação explícita");
    // Ainda sem acesso, o escopo do paciente continua marcado — sem inventar dados.
    expect(prompt).toContain("patientId 42");
  });

});

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

/**
 * Desde 2026-10-28 a Luma ajuda só com a ESTRUTURA do prontuário: o conteúdo de um
 * paciente iria para o provedor de IA nos EUA.
 */
describe("apoio ao prontuário: só a estrutura", () => {
  const prompt = (role: "therapist" | "patient", toolsEnabled = true) =>
    clinicalSystemPrompt(
      role === "therapist"
        ? therapistContext
        : { userId: 20, role: "patient" as const, patientId: 3 },
      role === "therapist" ? undefined : 3,
      toolsEnabled,
    );

  it("ensina a forma do registro (CFP, modelo em branco) e recusa o conteúdo do paciente", () => {
    for (const toolsEnabled of [true, false]) {
      const p = prompt("therapist", toolsEnabled);
      expect(p).toContain("PRONTUÁRIO: SÓ A ESTRUTURA");
      expect(p).toContain("MODELO EM BRANCO");
      expect(p).toContain("Resolução CFP 001/2009");
      expect(p).toMatch(/NÃO pode: receber, resumir, organizar ou reescrever anotações/);
      expect(p).not.toContain("RASCUNHO DE PRONTUÁRIO");
    }
  });

  it("indica os modelos prontos pelo nome (vindos de shared/prontuario)", () => {
    const p = prompt("therapist");
    for (const nome of ["SOAP", "DAP", "BIRP"]) expect(p).toContain(nome);
  });

  it("encerramento de quem sumiu: indica o modelo, mas o texto é dela", () => {
    const p = prompt("therapist");
    expect(p).toContain("ENCERRAMENTO:");
    expect(p).toContain("encerramentoRegistrado");
    expect(p).toMatch(/ela quem escreve e salva/i);
  });

  it("não vaza as regras de prontuário para o modo paciente", () => {
    const p = prompt("patient");
    expect(p).not.toContain("PRONTUÁRIO: SÓ A ESTRUTURA");
    expect(p).not.toContain("ENCERRAMENTO:");
  });

  it("regras detalhadas de estrutura só entram em pergunta de prontuário (custo do prompt)", () => {
    const comFoco = (prontuario: boolean) => clinicalSystemPrompt(therapistContext, undefined, true, undefined, { prontuario });
    expect(comFoco(true)).toContain("COMO AJUDAR NA ESTRUTURA");
    expect(comFoco(true)).toMatch(/NUNCA invente exemplo de paciente/);
    expect(comFoco(false)).not.toContain("COMO AJUDAR NA ESTRUTURA");
    expect(pareceAssuntoDeProntuario("monte um modelo de evolução em branco")).toBe(true);
    expect(pareceAssuntoDeProntuario("qual é o meu próximo paciente?")).toBe(false);
  });

  it("no Sussurro (sem a ajuda no prontuário) explica que é do Voz e não monta modelo", () => {
    const p = clinicalSystemPrompt(therapistContext, undefined, true, undefined, { prontuario: true }, { prontuario: false, documentos: false, relatorio: false });
    expect(p).not.toContain("PRONTUÁRIO: SÓ A ESTRUTURA");
    expect(p).not.toContain("COMO AJUDAR NA ESTRUTURA");
    expect(p).toMatch(/recurso do plano Voz \(R\$\s?89\/mês\)/);
    expect(p).toContain("aba Assinatura");
    // A trava de anotações vale em qualquer plano.
    expect(p).toMatch(/Em nenhum plano você recebe ou organiza anotações/);
    expect(buildSoEstruturaResponse(false, false)).toContain("faz parte do plano Voz");
  });

  it("documentos psicológicos: regras no Coro, aviso de plano fora dele (só em pergunta de documento)", () => {
    const coro = { prontuario: true, documentos: true, relatorio: true };
    const voz = { prontuario: true, documentos: false, relatorio: false };
    const doc = (recursos: typeof coro, documentos: boolean) =>
      clinicalSystemPrompt(therapistContext, undefined, true, undefined, { documentos }, recursos);
    expect(doc(coro, true)).toContain("Resolução CFP 06/2019");
    expect(doc(coro, true)).toMatch(/Declaração: .*NÃO traz sintoma, diagnóstico/);
    expect(doc(coro, false)).not.toContain("DOCUMENTOS PSICOLÓGICOS");
    expect(doc(voz, true)).toMatch(/recurso do plano Coro/);
    expect(doc(voz, true)).not.toContain("Resolução CFP 06/2019");
    expect(pareceDocumentoPsicologico("preciso de um modelo de declaração de comparecimento")).toBe(true);
    expect(pareceDocumentoPsicologico("como faço um laudo?")).toBe(true);
    expect(pareceDocumentoPsicologico("relatório da clínica")).toBe(false);
    expect(pedeRelatorioDaClinica("me mostra o relatório da clínica")).toBe(true);
    expect(pedeRelatorioDaClinica("como está o consultório?")).toBe(true);
    expect(pedeRelatorioDaClinica("modelo de relatório psicológico")).toBe(false);
  });

  it("sabe da assinatura e do Pix (texto montado dos dados do sistema)", () => {
    const p = prompt("therapist");
    expect(p).toContain("Sussurro");
    expect(p).toContain("Voz");
    expect(p).toContain("Coro");
    expect(p).toContain("Assinatura");
    // Preços regionais de 2026-10-28, vindos de shared/precos.
    expect(p).toMatch(/Sussurro: R\$\s?39\/mês/);
    expect(p).toMatch(/Voz: R\$\s?89\/mês/);
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
    (createClinicalTools(ctx, db, "t", undefined, incluirEscrita) as Array<{ name: string }>)
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
  it("as leituras da agenda continuam em qualquer caso", () => {
    for (const incluirEscrita of [true, false]) {
      const enviadas = nomes(incluirEscrita);
      expect(enviadas).toContain("get_minha_agenda");
      expect(enviadas).toContain("get_patient_appointments");
      expect(enviadas).toContain("get_prontuarios_incompletos");
    }
  });

  it("nenhuma ferramenta lê conteúdo clínico (sessões, documentos, preparo, busca)", () => {
    for (const incluirEscrita of [true, false]) {
      const enviadas = nomes(incluirEscrita);
      for (const clinica of ["get_patient_sessions", "get_patient_documents", "get_preparo_da_sessao", "search_patient_records"]) {
        expect(enviadas).not.toContain(clinica);
      }
    }
  });

  it("por padrao (sem informar) manda tudo, como antes", () => {
    const padrao = (createClinicalTools(ctx, db, "t") as Array<{ name: string }>).map((t) => t.name);
    for (const escrita of ESCRITA) expect(padrao).toContain(escrita);
  });
});
