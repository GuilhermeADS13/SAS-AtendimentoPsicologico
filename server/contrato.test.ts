import { describe, expect, it } from "vitest";
import {
  CAMPOS_DO_CONTRATO,
  CONTRATO_PADRAO,
  blocosDoContrato,
  contratoTextoSchema,
  preencherContrato,
} from "../shared/contrato";
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

describe("modelo padrão", () => {
  it("só usa campos que existem", () => {
    const usados = Array.from(CONTRATO_PADRAO.matchAll(/\{\{([a-z_]+)\}\}/g), (m) => m[1]);
    const conhecidos = CAMPOS_DO_CONTRATO.map((c) => c.chave as string);
    expect(usados.filter((c) => !conhecidos.includes(c))).toEqual([]);
  });

  it("não traz dado de nenhuma psicóloga", () => {
    expect(CONTRATO_PADRAO).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}|@|Recife|Nubank/);
  });

  it("passa na validação de salvar", () => {
    expect(contratoTextoSchema.safeParse(CONTRATO_PADRAO).success).toBe(true);
  });

  it("cada campo tem seção, e o título vira o do documento", () => {
    const { titulo, blocos } = blocosDoContrato(CONTRATO_PADRAO);
    expect(titulo).toBe("CONTRATO TERAPÊUTICO E TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO");
    expect(blocos.map((b) => b.titulo)).toContain("Sigilo");
    expect(blocos.find((b) => b.titulo === "Pagamento")?.texto).toContain("{{valor}}");
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
