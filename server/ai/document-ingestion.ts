import { extractRawText } from "mammoth";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 250;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type ExtractedChunk = {
  content: string;
  pageNumber?: number;
  ocrConfidence?: number;
};

function normalizeText(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function chunkExtractedText(text: string, pageNumber?: number): ExtractedChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const chunks: ExtractedChunk[] = [];
  let start = 0;
  let chunkIndex = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    const content = normalized.slice(start, end).trim();
    if (content) chunks.push({ content, pageNumber });
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
    chunkIndex += 1;
  }
  return chunks;
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractedChunk[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const textChunks = result.pages.flatMap(page => chunkExtractedText(page.text, page.num));
    if (textChunks.length > 0) return textChunks.map(chunk => ({ ...chunk }));

    const screenshots = await parser.getScreenshot({ scale: 1.5, imageBuffer: true, imageDataUrl: false });
    const worker = await createWorker("por");
    try {
      const ocrChunks: ExtractedChunk[] = [];
      for (const page of screenshots.pages) {
        const recognized = await worker.recognize(Buffer.from(page.data));
        ocrChunks.push(...chunkExtractedText(recognized.data.text, page.pageNumber).map(chunk => ({
          ...chunk,
          ocrConfidence: Math.max(0, Math.min(100, Number(recognized.data.confidence ?? 0))),
        })));
      }
      return ocrChunks;
    } finally {
      await worker.terminate();
    }
  } finally {
    await parser.destroy();
  }
}

export async function extractDocxText(buffer: Buffer): Promise<ExtractedChunk[]> {
  const result = await extractRawText({ buffer });
  return chunkExtractedText(result.value);
}

export async function extractClinicalDocument(
  buffer: Buffer,
  fileType: string,
  fileName: string,
): Promise<ExtractedChunk[]> {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("Documento excede o limite de 25 MB");
  const normalizedType = fileType.toLowerCase();
  const normalizedName = fileName.toLowerCase();
  if (normalizedType === "application/pdf" || normalizedName.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }
  if (
    normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalizedName.endsWith(".docx")
  ) {
    return extractDocxText(buffer);
  }
  throw new Error("Formato não suportado; somente PDF e DOCX podem ser indexados");
}
