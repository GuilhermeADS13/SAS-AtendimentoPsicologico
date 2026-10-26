import { describe, expect, it } from "vitest";
import { pagamentoDaConsulta } from "../shared/pagamentoDaConsulta";

const agora = new Date("2026-10-26T15:00:00Z");
const consulta = (mudancas: Partial<Parameters<typeof pagamentoDaConsulta>[0]> = {}) => ({
  scheduledAt: new Date("2026-10-20T15:00:00Z"),
  status: "completed",
  price: 15000,
  paid: false,
  pagamentoInformadoEm: null,
  participante: false,
  ...mudancas,
});

describe("o que o paciente vê do pagamento", () => {
  it("consulta que já aconteceu, com valor: em aberto", () => {
    expect(pagamentoDaConsulta(consulta(), agora)).toEqual({ valorCentavos: 15000, situacao: "em_aberto" });
  });

  it("só as que já aconteceram (decisão de 2026-10-26)", () => {
    expect(pagamentoDaConsulta(consulta({ scheduledAt: new Date("2026-10-30T15:00:00Z"), status: "scheduled" }), agora)).toBeNull();
    // Passou do horário e a psicóloga ainda não marcou como realizada: já conta.
    expect(pagamentoDaConsulta(consulta({ status: "scheduled" }), agora)?.situacao).toBe("em_aberto");
  });

  it("'Já paguei' fica aguardando a psicóloga; só vira pago quando ela confirma", () => {
    expect(pagamentoDaConsulta(consulta({ pagamentoInformadoEm: agora }), agora)?.situacao).toBe("aguardando");
    expect(pagamentoDaConsulta(consulta({ pagamentoInformadoEm: agora, paid: true }), agora)?.situacao).toBe("pago");
  });

  it("cancelada, sem valor ou de quem só participa da chamada em grupo: nada", () => {
    expect(pagamentoDaConsulta(consulta({ status: "cancelled" }), agora)).toBeNull();
    expect(pagamentoDaConsulta(consulta({ price: null }), agora)).toBeNull();
    expect(pagamentoDaConsulta(consulta({ price: 0 }), agora)).toBeNull();
    expect(pagamentoDaConsulta(consulta({ participante: true }), agora)).toBeNull();
  });
});
