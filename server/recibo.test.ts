/** Recibo de pagamento: CPF, valor por extenso e o texto (shared/recibo.ts). */
import { describe, expect, it } from "vitest";
import {
  cpfValido,
  mascaraCpf,
  oQueFaltaNoRecibo,
  textoDoRecibo,
  textoEditado,
  textoParaEditar,
  valorPorExtenso,
  type DadosDoRecibo,
} from "../shared/recibo";

describe("CPF", () => {
  it("aceita CPF com dígitos certos, com ou sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
  });
  it("recusa dígito errado, tamanho errado e números repetidos", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido("000.000.000-00")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
  it("mascara enquanto digita", () => {
    expect(mascaraCpf("529")).toBe("529");
    expect(mascaraCpf("5299822")).toBe("529.982.2");
    expect(mascaraCpf("52998224725")).toBe("529.982.247-25");
    expect(mascaraCpf("529.982.247-2599")).toBe("529.982.247-25");
  });
});

describe("valor por extenso", () => {
  it.each([
    [100, "um real"],
    [15000, "cento e cinquenta reais"],
    [30000, "trezentos reais"],
    [10000, "cem reais"],
    [30050, "trezentos reais e cinquenta centavos"],
    [101, "um real e um centavo"],
    [120000, "mil e duzentos reais"],
    [111000, "mil cento e dez reais"],
    [250000, "dois mil e quinhentos reais"],
    [2345600, "vinte e três mil quatrocentos e cinquenta e seis reais"],
    [100000000, "um milhão de reais"],
    [99, "noventa e nove centavos"],
  ])("%i centavos = %s", (centavos, texto) => {
    expect(valorPorExtenso(centavos)).toBe(texto);
  });
});

const base: DadosDoRecibo = {
  psicologa: { nome: "Beatriz Almeida", crp: "02/31234", cpf: "529.982.247-25", endereco: "Rua Exemplo, 100, Recife/PE" },
  paciente: { nome: "Ana Souza", cpf: "111.444.777-35" },
  consultas: [
    { data: new Date("2026-10-22T18:00:00-03:00"), valorCentavos: 15000 },
    { data: new Date("2026-10-08T18:00:00-03:00"), valorCentavos: 15000 },
  ],
  cidade: "Recife/PE",
  emitidoEm: new Date("2026-11-09T12:00:00-03:00"),
};

describe("texto do recibo", () => {
  it("soma as consultas, ordena as datas e escreve o valor por extenso", () => {
    const t = textoDoRecibo(base);
    expect(t.corpo[0]).toBe(
      "Recebi de Ana Souza, CPF 111.444.777-35, a quantia de R$ 300,00 (trezentos reais), referente a 2 sessões de psicoterapia realizadas em 08/10/2026 e 22/10/2026.",
    );
    expect(t.local).toBe("Recife/PE, 9 de novembro de 2026.");
    expect(t.assinatura).toEqual(["Beatriz Almeida", "CRP 02/31234", "CPF 529.982.247-25", "Rua Exemplo, 100, Recife/PE"]);
  });

  it("quando outra pessoa pagou, o recibo é dela e cita o paciente atendido", () => {
    const t = textoDoRecibo({ ...base, consultas: [base.consultas[0]], pagador: { nome: "Carlos Souza", cpf: "529.982.247-25" } });
    expect(t.corpo[0]).toContain("Recebi de Carlos Souza, CPF 529.982.247-25, a quantia");
    expect(t.corpo[0]).toContain("referente à sessão de psicoterapia realizada em 22/10/2026, prestada a Ana Souza (CPF 111.444.777-35).");
  });

  it("aponta o que falta para valer no Imposto de Renda", () => {
    expect(oQueFaltaNoRecibo(base)).toEqual([]);
    const semDados = { ...base, psicologa: { nome: "Bia", crp: "02/1" }, paciente: { nome: "Ana", cpf: "123" } };
    expect(oQueFaltaNoRecibo(semDados)).toEqual(["o seu CPF", "o seu endereço de atendimento", "o CPF do paciente"]);
    // CPF inválido não entra no texto.
    expect(textoDoRecibo(semDados).corpo[0]).toMatch(/^Recebi de Ana a quantia/);
  });
});

describe("texto editado antes de baixar", () => {
  it("abrir a edição e não mexer devolve o mesmo recibo", () => {
    const t = textoDoRecibo(base);
    expect(textoEditado(textoParaEditar(t))).toEqual(t);
  });

  it("cada linha com texto vira um parágrafo; linhas em branco e espaços sobram", () => {
    const t = textoEditado({
      corpo: "  Recebi de Ana R$ 300,00 referente a avaliação psicológica.  \r\n\r\n\r\nPara clareza, firmo o presente recibo.\n",
      local: "  Olinda/PE, 10 de novembro de 2026.  ",
      assinatura: "Beatriz Almeida\n\nCRP 02/31234\n",
    });
    expect(t).toEqual({
      titulo: "RECIBO",
      corpo: ["Recebi de Ana R$ 300,00 referente a avaliação psicológica.", "Para clareza, firmo o presente recibo."],
      local: "Olinda/PE, 10 de novembro de 2026.",
      assinatura: ["Beatriz Almeida", "CRP 02/31234"],
    });
  });

  it("texto apagado fica vazio (a tela barra antes de gerar)", () => {
    expect(textoEditado({ corpo: "  \n \n", local: "", assinatura: "" }).corpo).toEqual([]);
  });
});
