/**
 * Arquivo de recibos do Receita Saúde para o Carnê-Leão (shared/receitaSaude.ts).
 * O formato é o do exemplo do manual do Receita Saúde v2.1, pergunta 24.
 */
import { describe, expect, it } from "vitest";
import {
  arquivoDoCarneLeao,
  dataDoPagamento,
  linhaDoCarneLeao,
  mesEmBrasilia,
  nomeDoArquivo,
  problemasDoLote,
  valorDoCarneLeao,
  type ReciboDoLote,
} from "../shared/receitaSaude";

const CPF_PSICOLOGA = "529.982.247-25";
const CPF_PACIENTE = "11144477735";
const CPF_MAE = "12345678909";

const recibo = (extra: Partial<ReciboDoLote> = {}): ReciboDoLote => ({
  pagoEm: new Date("2026-11-05T15:00:00-03:00"),
  consultaEm: new Date("2026-11-04T19:00:00-03:00"),
  valorCentavos: 15000,
  cpfPagador: CPF_PACIENTE,
  cpfBeneficiario: CPF_PACIENTE,
  ...extra,
});

describe("linha do Carnê-Leão", () => {
  it("segue o exemplo do manual: 16 campos, sem cabeçalho e sem ';' no fim", () => {
    const linha = linhaDoCarneLeao(recibo({ cpfPagador: CPF_MAE }), CPF_PSICOLOGA);
    expect(linha).toBe(
      "05/11/2026;R01.001.001;255;150,00;;Psicoterapia realizada em 04/11/2026;PF;12345678909;11144477735;;;;;S;52998224725;",
    );
    expect(linha.split(";")).toHaveLength(16);
    // Só caracteres simples: sai igual em qualquer codificação.
    expect(/^[\x20-\x7e]+$/.test(linha)).toBe(true);
  });

  it("usa a data do Brasil, não a do servidor", () => {
    // 01:30 em UTC do dia 1º ainda é 31 de outubro no Brasil.
    const linha = linhaDoCarneLeao(recibo({ pagoEm: new Date("2026-11-01T01:30:00Z") }), CPF_PSICOLOGA);
    expect(linha.startsWith("31/10/2026;")).toBe(true);
  });

  it("o arquivo tem uma linha por recibo, separadas por \\n e sem linha em branco no fim", () => {
    const arquivo = arquivoDoCarneLeao([recibo(), recibo({ valorCentavos: 20000 })], CPF_PSICOLOGA);
    expect(arquivo.split("\n")).toHaveLength(2);
    expect(arquivo.endsWith("\n")).toBe(false);
    expect(arquivo).not.toContain("\r");
  });
});

describe("valores e datas", () => {
  it("valor com vírgula e sem separador de milhar", () => {
    expect(valorDoCarneLeao(15000)).toBe("150,00");
    expect(valorDoCarneLeao(15050)).toBe("150,50");
    expect(valorDoCarneLeao(5)).toBe("0,05");
    expect(valorDoCarneLeao(123456789)).toBe("1234567,89");
  });

  it("a data do pagamento é o 'Já paguei', depois a marcação dela, depois o dia da sessão", () => {
    const sessao = "2026-11-04T22:00:00Z";
    expect(dataDoPagamento({ scheduledAt: sessao, paidAt: "2026-11-09T12:00:00Z", pagamentoInformadoEm: "2026-11-05T12:00:00Z" }).toISOString()).toBe(
      "2026-11-05T12:00:00.000Z",
    );
    expect(dataDoPagamento({ scheduledAt: sessao, paidAt: "2026-11-09T12:00:00Z", pagamentoInformadoEm: null }).toISOString()).toBe(
      "2026-11-09T12:00:00.000Z",
    );
    expect(dataDoPagamento({ scheduledAt: sessao }).toISOString()).toBe("2026-11-04T22:00:00.000Z");
  });

  it("mês e nome do arquivo", () => {
    expect(mesEmBrasilia(new Date("2026-12-01T02:00:00Z"))).toEqual({ ano: 2026, mes: 11 });
    expect(nomeDoArquivo(2026, 3)).toBe("receita-saude-2026-03.csv");
  });
});

describe("o que impede o arquivo", () => {
  it("lote certo não tem problema", () => {
    expect(problemasDoLote([recibo()], CPF_PSICOLOGA)).toEqual([]);
  });

  it("sem o CPF dela, sem consulta ou sem o CPF do paciente", () => {
    expect(problemasDoLote([recibo()], null)).toEqual(["Falta o seu CPF, o mesmo que você usa no Carnê-Leão."]);
    expect(problemasDoLote([], CPF_PSICOLOGA)).toEqual(["Marque pelo menos uma consulta."]);
    expect(problemasDoLote([recibo({ cpfBeneficiario: "" }), recibo({ cpfPagador: "111.111.111-11" })], CPF_PSICOLOGA)).toEqual([
      "Falta o CPF em 2 recibos.",
    ]);
    expect(problemasDoLote([recibo({ cpfBeneficiario: "" })], CPF_PSICOLOGA)).toEqual(["Falta o CPF em 1 recibo."]);
  });

  it("valor zerado, anos misturados e mais de 1.000 recibos", () => {
    expect(problemasDoLote([recibo({ valorCentavos: 0 })], CPF_PSICOLOGA)).toEqual(["Há consulta sem valor."]);
    expect(problemasDoLote([recibo(), recibo({ pagoEm: new Date("2025-12-30T12:00:00-03:00") })], CPF_PSICOLOGA)).toEqual([
      "Todos os recibos de um arquivo precisam ser do mesmo ano.",
    ]);
    const muitos = Array.from({ length: 1001 }, () => recibo());
    expect(problemasDoLote(muitos, CPF_PSICOLOGA)[0]).toMatch(/até 1000 recibos/);
  });
});
