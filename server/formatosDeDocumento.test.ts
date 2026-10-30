import { describe, expect, it } from "vitest";
import { nomeNoFormato, opcoesDeDownload, visualizacaoDoArquivo } from "../shared/formatosDeDocumento";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const formatos = (mime: string) => opcoesDeDownload(mime).map((o) => o.formato);

describe("o que a tela oferece para cada documento", () => {
  it("PDF e imagem abrem na tela; o que o navegador não mostra não tem botão Ver", () => {
    expect(visualizacaoDoArquivo("application/pdf")).toBe("pdf");
    expect(visualizacaoDoArquivo("image/png")).toBe("imagem");
    expect(visualizacaoDoArquivo("image/heic")).toBeNull();
    expect(visualizacaoDoArquivo(DOCX)).toBeNull();
  });

  it("não oferece converter para o formato que o arquivo já tem", () => {
    expect(formatos("application/pdf")).toEqual(["word"]);
    expect(formatos(DOCX)).toEqual(["pdf"]);
  });

  it("imagem vira os dois formatos", () => {
    expect(formatos("image/jpeg")).toEqual(["pdf", "word"]);
  });

  it("entre PDF e Word, avisa antes do clique que só o texto passa", () => {
    expect(opcoesDeDownload("application/pdf")[0].rotulo).toContain("só o texto");
    expect(opcoesDeDownload(DOCX)[0].rotulo).toContain("só o texto");
  });

  it("áudio e planilha ficam só com o original", () => {
    expect(opcoesDeDownload("audio/mpeg")).toEqual([]);
    expect(opcoesDeDownload("application/vnd.ms-excel")).toEqual([]);
  });

  it("troca a extensão sem mexer no nome", () => {
    expect(nomeNoFormato("laudo.final.pdf", "docx")).toBe("laudo.final.docx");
    expect(nomeNoFormato("sem extensao", "pdf")).toBe("sem extensao.pdf");
  });
});
