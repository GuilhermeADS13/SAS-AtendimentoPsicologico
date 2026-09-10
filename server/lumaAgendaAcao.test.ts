import { describe, expect, it } from "vitest";
import { pareceAcaoDeAgenda } from "./ai/llm";

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
