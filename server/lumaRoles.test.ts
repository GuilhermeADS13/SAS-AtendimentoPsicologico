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

  /**
   * Regressão de ROTEAMENTO: o tópico de agenda casa com "consulta|psicolog|sessao"
   * e estava ANTES dos específicos, então engolia vídeo e a página da psicóloga
   * ("onde fica minha psicóloga?" respondia sobre horários, e a alternativa
   * "entrar na consulta" do tópico de vídeo era código inalcançável). Pagamento
   * também não pegava "pago"/"custa" ("pagar" não casa com "pago"). Aqui fixamos a
   * tabela: específicos primeiro, genérico de agenda por último.
   */
  it.each([
    ["quanto custa a consulta?", "payments"],
    ["como pago a sessao?", "payments"],
    ["onde fica minha psicologa?", "therapist"],
    ["quem e a minha psicologa?", "therapist"],
    ["qual o CRP dela?", "therapist"],
    ["como entro na consulta?", "video"],
    ["como entro na videochamada?", "video"],
    ["meus dados estao seguros?", "privacy"],
    // os que já funcionavam e não podem regredir com a reordenação
    ["onde vejo minhas consultas?", "appointments"],
    ["quero marcar uma consulta", "appointments"],
    ["quero remarcar minha consulta", "reschedule"],
    ["onde vejo minhas mensagens?", "mensagens"],
    ["como mudo meus dados?", "profile"],
    ["como troco minha senha?", "profile"],
    ["quem ve meu prontuario?", "privacy"],
    // "página" não pode virar "pagamento"
    ["em qual pagina eu vejo isso?", "general"],
    // Buracos achados rodando perguntas reais do paciente (2026-10-09): os três
    // caíam no menu genérico.
    ["como confirmo presenca?", "appointments"],
    ["como adiciono na minha agenda?", "appointments"],
    ["como envio um arquivo?", "mensagens"],
    ["quero anexar uma foto", "mensagens"],
    ["quem e voce?", "luma"],
    ["com quem eu estou falando?", "luma"],
    // "compartilhar" sozinho puxava arquivo para o tópico de vídeo; só tela.
    ["quero compartilhar a tela", "video"],
  ])("roteia %s para o tópico %s", (pergunta, topico) => {
    expect(answerSiteHelp(pergunta).topic).toBe(topico);
  });

  // A troca de e-mail passou a exigir CÓDIGO de verificação; o texto do paciente
  // dizia "altere e salve", contradizendo a tela e a página de Ajuda.
  it("explica que a troca de e-mail exige código de verificação", () => {
    const response = answerSiteHelp("como troco meu e-mail?");
    expect(response.topic).toBe("profile");
    expect(response.content).toMatch(/c[óo]digo de verifica/i);
  });

  // A Luma do paciente (navegação, sem LLM) também precisa acolher crise: é ela
  // que o paciente tem à mão. Uma fala de risco não pode cair no menu de ajuda.
  it("intercepta crise no modo paciente com acolhimento e CVV/SAMU", () => {
    const response = answerSiteHelp("não aguento mais viver");
    expect(response.topic).toBe("crisis");
    expect(response.content).toMatch(/\b188\b|CVV/);
    expect(response.content).toMatch(/\b192\b|SAMU/);
  });

  it("não faz diagnóstico nem indica medicação no modo paciente", () => {
    expect(answerSiteHelp("qual é o meu diagnóstico?").topic).toBe("boundary");
    expect(answerSiteHelp("qual remédio devo tomar?").topic).toBe("boundary");
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

  it("declara idempotência para retries sem duplicar histórico", () => {
    const migration = readFileSync(new URL("../drizzle/migrations/0019_ai_message_idempotency.sql", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/Luma.tsx", import.meta.url), "utf8");

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "clientRequestId"');
    expect(migration).toContain("ai_conversations_user_request_idx");
    expect(migration).toContain("ai_messages_conversation_request_idx");
    expect(page).toContain("crypto.randomUUID()");
    expect(page).toContain("requestId");
    expect(page).toContain("setConversationId(result.conversationId)");
  });

  it("mantém o modo paciente fora do RAG clínico", () => {
    const source = readFileSync(new URL("../client/src/pages/Luma.tsx", import.meta.url), "utf8");

    expect(source).toContain("siteHelpMutation.mutateAsync");
    expect(source).toContain("if (!isClinicalUser)");
    // Admin entra no modo clínico (decisão de 2026-10-07): o servidor o trata como
    // psicóloga só se tiver perfil, no escopo dos próprios pacientes — ver
    // aiAcessoAdmin.test.ts. Paciente continua fora, pelo isClinicalUser acima.
    expect(source).toContain("const isClinicalUser = isTherapist;");
    expect(source).not.toContain("chatMutation.mutateAsync({ messages: nextMessages");
    // Texto encurtado para caber no campo de uma linha no celular; o que importa
    // aqui é o placeholder CLÍNICO existir, provando o modo separado.
    expect(source).toContain("Pergunte sobre este paciente");
    expect(source).not.toContain('placeholder="Escreva uma pergunta sobre o uso do site..."');
  });
});
