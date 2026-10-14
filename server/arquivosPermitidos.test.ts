import { describe, expect, it } from "vitest";
import { problemaNoArquivo, TAMANHO_MAXIMO_DE_ARQUIVO } from "../shared/arquivosPermitidos";

/** O que entra no bucket `documents` (mesma lista gravada no bucket, migração 0034). */
describe("arquivos permitidos no bucket de documentos", () => {
  it.each([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/heic",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain;charset=UTF-8",
    "audio/mpeg",
  ])("aceita %s", (type) => {
    expect(problemaNoArquivo({ type, size: 1000 })).toBeNull();
  });

  it.each(["text/html", "image/svg+xml", "application/x-msdownload", "application/zip", "application/octet-stream", ""])(
    "recusa %s (código, executável, compactado ou desconhecido)",
    (type) => {
      expect(problemaNoArquivo({ type, size: 1000 })).toMatch(/não aceito/);
    },
  );

  it("recusa acima de 20 MB", () => {
    expect(problemaNoArquivo({ type: "application/pdf", size: TAMANHO_MAXIMO_DE_ARQUIVO + 1 })).toMatch(/20 MB/);
  });
});
