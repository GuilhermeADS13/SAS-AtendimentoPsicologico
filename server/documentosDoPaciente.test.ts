import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rotuloDoTipo, tipoParaPacienteSchema } from "../shared/documentosDoPaciente";

describe("documentos que o paciente pode receber", () => {
  it("laudo, parecer, atestado, declaração e relatório podem ser compartilhados", () => {
    for (const tipo of ["laudo", "parecer", "atestado", "declaracao", "relatorio"]) {
      expect(tipoParaPacienteSchema.safeParse(tipo).success).toBe(true);
    }
  });

  it("evolução e prontuário não existem como tipo compartilhável", () => {
    for (const tipo of ["evolucao", "prontuario", "anotacao", "anamnese", ""]) {
      expect(tipoParaPacienteSchema.safeParse(tipo).success).toBe(false);
    }
  });

  it("rótulo desconhecido não quebra a tela", () => {
    expect(rotuloDoTipo("laudo")).toBe("Laudo");
    expect(rotuloDoTipo(null)).toBe("Documento");
  });
});

describe("rotas do paciente para documentos", () => {
  const fonte = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const trecho = (de: string, ate: string) => fonte.slice(fonte.indexOf(de), fonte.indexOf(ate, fonte.indexOf(de)));

  it("a lista e o link só alcançam documento do próprio paciente e já compartilhado", () => {
    const lista = trecho("documentos: protectedProcedure", "urlDoDocumento: protectedProcedure");
    const link = trecho("urlDoDocumento: protectedProcedure", "pixDaPsicologa: protectedProcedure");
    for (const rota of [lista, link]) {
      expect(rota).toContain("eq(documents.patientId, paciente.id)");
      expect(rota).toContain("isNotNull(documents.tipoParaPaciente)");
    }
  });

  it("a lista escolhe as colunas: o caminho do arquivo não vai para o paciente", () => {
    const lista = trecho("documentos: protectedProcedure", "urlDoDocumento: protectedProcedure");
    expect(lista).not.toContain(".select()");
    expect(lista).not.toContain("fileKey");
    expect(lista).not.toContain("description");
  });
});
