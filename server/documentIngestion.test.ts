import { describe, expect, it } from "vitest";
import { chunkExtractedText, extractClinicalDocument } from "./ai/document-ingestion";

describe("ingestão de documentos clínicos", () => {
  it("normaliza e divide o texto preservando a página", () => {
    const chunks = chunkExtractedText(`  Linha 1\t\n\n\nLinha 2  `, 3);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("Linha 1\n\nLinha 2");
    expect(chunks[0].pageNumber).toBe(3);
  });

  it("divide conteúdos longos em chunks com sobreposição", () => {
    const source = "a".repeat(4000);
    const chunks = chunkExtractedText(source);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every(chunk => chunk.content.length <= 1800)).toBe(true);
    expect(chunks[0].content.slice(-250)).toBe(chunks[1].content.slice(0, 250));
  });

  it("recusa formatos que não sejam PDF ou DOCX", async () => {
    await expect(
      extractClinicalDocument(Buffer.from("texto"), "text/plain", "anotacao.txt"),
    ).rejects.toThrow("somente PDF e DOCX");
  });
});
