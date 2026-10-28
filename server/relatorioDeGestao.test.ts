import { describe, expect, it } from "vitest";
import { montarRelatorioDeGestao, relatorioEmTexto, type ConsultaDoRelatorio } from "./relatorioDeGestao";
import { recursosDoPlano } from "./assinaturas";
import { PLANOS } from "../shared/precos";

const agora = new Date("2026-10-28T12:00:00-03:00");
const DIA = 86_400_000;
const diasAtras = (n: number) => new Date(agora.getTime() - n * DIA);
const consulta = (patientId: number, dias: number, status: string, price: number | null, paid = false): ConsultaDoRelatorio => ({
  patientId,
  scheduledAt: diasAtras(dias),
  status,
  price,
  paid,
  confirmedAt: null,
});

const pacientes = [
  { id: 1, nome: "Ana Souza", status: "active", createdAt: diasAtras(200) },
  { id: 2, nome: "Bruno Lima", status: "active", createdAt: diasAtras(200) },
  { id: 3, nome: "Carla Dias", status: "inactive", createdAt: diasAtras(200) },
  { id: 4, nome: "Davi Melo", status: "active", createdAt: diasAtras(5) },
];

const consultas = [
  // Últimos 30 dias: 3 realizadas (1 paga), 1 falta, 1 cancelada.
  consulta(1, 3, "completed", 15000, true),
  consulta(1, 10, "completed", 15000, false),
  consulta(4, 2, "scheduled", 12000, false), // passou e não foi fechada: conta como realizada
  consulta(1, 17, "no_show", 15000),
  consulta(4, 20, "cancelled", 12000),
  // Período anterior: 1 realizada e paga.
  consulta(1, 40, "completed", 15000, true),
  // Bruno: dívida antiga e nada marcado há 90 dias → devendo e sumido.
  consulta(2, 90, "completed", 20000, false),
  // Próximos 7 dias: 2 agendadas (nenhuma confirmada).
  consulta(1, -2, "scheduled", 15000),
  consulta(4, -5, "scheduled", 12000),
];

describe("relatório da clínica (Coro), sem IA", () => {
  const r = montarRelatorioDeGestao(consultas, pacientes, agora);

  it("conta realizadas, faltas, cancelamentos e comparecimento dos últimos 30 dias", () => {
    expect(r.atual).toMatchObject({ realizadas: 3, faltas: 1, canceladas: 1, comparecimento: 75 });
    expect(r.anterior.realizadas).toBe(1);
  });

  it("separa recebido de a receber no período", () => {
    expect(r.atual.recebido).toBe(15000);
    expect(r.atual.aReceber).toBe(27000);
  });

  it("quem está devendo olha todo o histórico, do maior para o menor", () => {
    expect(r.inadimplentes).toEqual([
      { nome: "Bruno Lima", total: 20000 },
      { nome: "Ana Souza", total: 15000 },
      { nome: "Davi Melo", total: 12000 },
    ]);
    expect(r.totalDevido).toBe(47000);
  });

  it("sumidos só entre os ativos; recém-cadastrado não conta como sumido", () => {
    expect(r.sumidos).toEqual(["Bruno Lima"]);
    expect(r.pacientesAtivos).toBe(3);
    expect(r.novosPacientes).toBe(1);
  });

  it("próximos 7 dias e as sem confirmação", () => {
    expect(r.proximos7Dias).toEqual({ agendadas: 2, naoConfirmadas: 2 });
  });

  it("texto para a Luma, com variação frente ao período anterior", () => {
    const t = relatorioEmTexto(r);
    expect(t).toContain("últimos 30 dias");
    expect(t).toMatch(/Comparecimento: \*\*75%\*\*/);
    expect(t).toContain("▲ 2 frente ao período anterior");
    expect(t).toContain("Bruno Lima");
  });

  it("sem consultas não divide por zero", () => {
    const vazio = montarRelatorioDeGestao([], [], agora);
    expect(vazio.atual.comparecimento).toBeNull();
    expect(relatorioEmTexto(vazio)).toContain("sem consultas no período");
  });
});

describe("recursos por plano", () => {
  const [sussurro, voz, coro] = PLANOS;
  it("documentos e relatório só no Coro; prontuário no Voz e no Coro", () => {
    expect(recursosDoPlano(sussurro, false, false)).toEqual({ lumaNoProntuario: false, documentosPsicologicos: false, relatorioDeGestao: false });
    expect(recursosDoPlano(voz, false, false)).toEqual({ lumaNoProntuario: true, documentosPsicologicos: false, relatorioDeGestao: false });
    expect(recursosDoPlano(coro, false, false)).toEqual({ lumaNoProntuario: true, documentosPsicologicos: true, relatorioDeGestao: true });
  });
  it("teste grátis e admin têm tudo", () => {
    for (const r of [recursosDoPlano(sussurro, false, true), recursosDoPlano(sussurro, true, false)]) {
      expect(Object.values(r).every(Boolean)).toBe(true);
    }
  });
});
