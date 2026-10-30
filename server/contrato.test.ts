import { describe, expect, it } from "vitest";
import { blocosDoContrato, contratoTextoSchema, preencherContrato } from "../shared/contrato";
import { textoSemCortes } from "./ai/document-ingestion";

describe("preenchimento do contrato", () => {
  it("troca os campos pelos valores", () => {
    expect(preencherContrato("Nome: {{paciente}}, CRP {{ crp }}", { paciente: "Ana", crp: "00/000000" })).toBe(
      "Nome: Ana, CRP 00/000000",
    );
  });

  it("campo sem valor vira linha para preencher à mão", () => {
    expect(preencherContrato("CPF: {{cpf_paciente}}", { cpf_paciente: "  " })).toBe(`CPF: ${"_".repeat(20)}`);
  });

  it("observações vazias somem em vez de deixar uma linha solta", () => {
    expect(preencherContrato("{{observacoes}}", {})).toBe("");
  });

  it("campo digitado errado continua visível", () => {
    expect(preencherContrato("{{pacinte}}", { paciente: "Ana" })).toBe("{{pacinte}}");
  });

  it("não usa cifrão do valor como padrão de troca", () => {
    expect(preencherContrato("{{valor}}", { valor: "R$ 150,00 $& $1" })).toBe("R$ 150,00 $& $1");
  });
});

describe("modelo da psicóloga", () => {
  const modelo = "# MEU CONTRATO\n\n## Pagamento\nValor: {{valor}}\n\n## Sigilo\nTexto próprio.";

  it("título e seções vêm do texto dela", () => {
    const { titulo, blocos } = blocosDoContrato(modelo);
    expect(titulo).toBe("MEU CONTRATO");
    expect(blocos.map((b) => b.titulo)).toEqual(["Pagamento", "Sigilo"]);
    expect(blocos[0].texto).toContain("{{valor}}");
  });

  it("valida o texto antes de salvar", () => {
    expect(contratoTextoSchema.safeParse(modelo).success).toBe(true);
    expect(contratoTextoSchema.safeParse("   ").success).toBe(false);
  });
});

describe("texto vindo de arquivo", () => {
  it("sem título ou seção: título genérico e parágrafos corridos", () => {
    const { titulo, blocos } = blocosDoContrato("Primeiro parágrafo\ncontinua\r\n\r\nSegundo");
    expect(titulo).toBe("CONTRATO TERAPÊUTICO");
    expect(blocos).toEqual([{ texto: "Primeiro parágrafo\ncontinua" }, { texto: "Segundo" }]);
  });

  it("documento longo não repete trechos, ao contrário dos cortes do RAG", () => {
    const longo = Array.from({ length: 900 }, (_, i) => `palavra${i}`).join(" ");
    expect(textoSemCortes(longo)).toEqual([{ content: longo, pageNumber: undefined }]);
  });
});
