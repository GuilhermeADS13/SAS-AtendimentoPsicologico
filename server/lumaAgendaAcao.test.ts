import { describe, expect, it } from "vitest";
import { pareceAcaoDeAgenda, pareceNavegacao } from "./ai/llm";

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
