import { describe, expect, it } from "vitest";
import { forcarPropostaDeAgenda, pareceAcaoDeAgenda, pareceNavegacao, type LumaPendingAction } from "./ai/llm";

/**
 * Regressão: a Luma clínica curto-circuitava com "Não encontrei registros" quando
 * o paciente não tinha sessão/documento — bloqueando o PRIMEIRO agendamento de um
 * paciente recém-cadastrado. `pareceAcaoDeAgenda` é o que evita esse atalho para
 * pedidos de ação na agenda; aqui garantimos que ela distingue ação de leitura.
 */
describe("pareceAcaoDeAgenda", () => {
  it.each([
    "agende uma consulta para amanhã às 15h",
    "marque a Ana quinta às 14h",
    "remarcar a consulta de sexta",
    "reagendar para outro dia",
    "cancelar a consulta de hoje",
    "desmarcar o horário",
    "registrar o pagamento da última sessão",
    "marcar pagamento como pago",
    "criar uma nova consulta para este paciente",
    "abrir um novo agendamento",
  ])("reconhece ação de agenda: %s", (msg) => {
    expect(pareceAcaoDeAgenda(msg)).toBe(true);
  });

  it.each([
    "resumir os últimos registros autorizados",
    "como está a evolução do paciente?",
    "quanto é 1 + 1",
    "organizar os próximos pontos para a sessão",
    "qual a capital da França",
  ])("NÃO confunde leitura/fora de escopo com ação: %s", (msg) => {
    expect(pareceAcaoDeAgenda(msg)).toBe(false);
  });
});

/**
 * Perguntas de navegação ("onde vejo X", "como faço Y aqui") sao USO DO SISTEMA e
 * nao dependem de registros — nao podem cair no atalho de "sem registros". Aqui
 * garantimos que `pareceNavegacao` reconhece navegacao e nao confunde com leitura
 * clinica ("como está a evolução") nem com fora de escopo.
 */
describe("pareceNavegacao", () => {
  it.each([
    "onde vejo meus pacientes?",
    "onde fica o financeiro",
    "como faço para cadastrar um paciente",
    "como acesso os pagamentos",
    "como entro na videochamada",
    "como cadastro um paciente aqui",
    "como coloco meu prontuário aqui?",
    "como envio o meu modelo de prontuário",
    "como anexo um documento",
  ])("reconhece navegação: %s", (msg) => {
    expect(pareceNavegacao(msg)).toBe(true);
  });

  it.each([
    "resumir os últimos registros autorizados",
    "como está a evolução do paciente?",
    "agende uma consulta para amanhã",
    "quanto é 1 + 1",
  ])("NÃO confunde leitura/ação/fora de escopo com navegação: %s", (msg) => {
    expect(pareceNavegacao(msg)).toBe(false);
  });
});

/**
 * Fallback DETERMINÍSTICO: gpt-oss às vezes NARRA a ação ("responda sim") em vez de
 * CHAMAR a ferramenta — e sem a chamada nenhuma proposta é emitida, então o botão de
 * confirmação nunca aparece. `forcarPropostaDeAgenda` reinvoca o modelo forçando a
 * chamada de ferramenta e, quando uma ferramenta de escrita propõe (seta o pending),
 * devolve um texto de confirmação sintetizado do resumo. Aqui exercitamos a
 * orquestração (dispatch por nome, laço read→write, condição de parada) com um modelo
 * e ferramentas fakes — sem depender do provedor real.
 */
describe("forcarPropostaDeAgenda", () => {
  // Modelo fake: devolve, a cada invoke, o próximo conjunto de tool_calls da fila.
  function modeloFake(fila: Array<Array<{ name: string; args: Record<string, unknown>; id?: string }>>) {
    let i = 0;
    const bound = {
      invoke: async () => ({ content: "", tool_calls: fila[i++] ?? [] }),
    };
    return { bindTools: () => bound } as unknown as Parameters<typeof forcarPropostaDeAgenda>[0];
  }

  const mensagens = [{ role: "user" as const, content: "cancele a consulta #12" }];

  it("propõe a ação quando o modelo chama a ferramenta de escrita (1 passo)", async () => {
    let pending: LumaPendingAction | undefined;
    const resumo = "Agendar consulta com Fulano em 22/09/2026 10:00, 60 minutos.";
    const tools = [
      { name: "agendar_consulta", invoke: async () => { pending = { code: "cod123456", toolName: "agendar_consulta", resumo }; return "AINDA NÃO EXECUTADO."; } },
    ] as unknown as Parameters<typeof forcarPropostaDeAgenda>[1];

    const texto = await forcarPropostaDeAgenda(
      modeloFake([[{ name: "agendar_consulta", args: { scheduledAt: "2026-09-22T10:00:00" }, id: "1" }]]),
      tools, "sys", mensagens, () => pending,
    );
    expect(pending).toBeDefined();
    expect(texto).toContain(resumo);
    expect(texto).toContain("Confirmar");
  });

  it("consulta a agenda e só então propõe (read → write)", async () => {
    let pending: LumaPendingAction | undefined;
    const resumo = "Cancelar a consulta #12 de 22/09/2026, 10:00.";
    const tools = [
      { name: "get_patient_appointments", invoke: async () => "consultas: #12 em 22/09 10:00" },
      { name: "cancelar_consulta", invoke: async () => { pending = { code: "cod123456", toolName: "cancelar_consulta", resumo }; return "AINDA NÃO EXECUTADO."; } },
    ] as unknown as Parameters<typeof forcarPropostaDeAgenda>[1];

    const texto = await forcarPropostaDeAgenda(
      modeloFake([
        [{ name: "get_patient_appointments", args: {}, id: "1" }],
        [{ name: "cancelar_consulta", args: { appointmentId: 12 }, id: "2" }],
      ]),
      tools, "sys", mensagens, () => pending,
    );
    expect(pending?.toolName).toBe("cancelar_consulta");
    expect(texto).toContain(resumo);
  });

  it("desiste (retorna undefined) se o modelo não chama ferramenta nenhuma", async () => {
    let pending: LumaPendingAction | undefined;
    const tools = [] as unknown as Parameters<typeof forcarPropostaDeAgenda>[1];
    const texto = await forcarPropostaDeAgenda(modeloFake([[]]), tools, "sys", mensagens, () => pending);
    expect(texto).toBeUndefined();
  });
});
