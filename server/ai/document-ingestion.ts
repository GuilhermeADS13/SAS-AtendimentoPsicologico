import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { extractRawText } from "mammoth";
import { PDFParse } from "pdf-parse";
import { aiDocumentChunks, documents, patients, type Document as ClinicalDocument } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AiAccessContext } from "./access";
import { embeddingForCurrentEnvironment } from "./rag";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 250;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const EMBEDDING_DIMENSIONS = 768;

export type ExtractedChunk = {
  content: string;
  pageNumber?: number;
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
    return result.pages.flatMap(page => chunkExtractedText(page.text, page.num));
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

function supabaseStorageClient(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para extrair arquivos privados");
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function downloadPrivateDocument(document: ClinicalDocument): Promise<Buffer> {
  const { data, error } = await supabaseStorageClient().storage.from("documents").download(document.fileKey);
  if (error || !data) throw new Error(`Falha ao baixar documento privado: ${error?.message ?? "arquivo ausente"}`);
  return Buffer.from(await data.arrayBuffer());
}

function vectorLiteral(values: number[]): string {
  if (values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding incompatível: esperado ${EMBEDDING_DIMENSIONS}, recebido ${values.length}`);
  }
  return `[${values.join(",")}]`;
}

async function authorizedDocument(db: Db, ctx: AiAccessContext, documentId: number): Promise<ClinicalDocument> {
  if (ctx.role === "admin") throw new Error("Administrador não possui acesso a prontuários pelo agente");
  const rows = ctx.role === "therapist"
    ? await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.therapistId, ctx.therapistId as number))).limit(1)
    : await db.select({ document: documents }).from(documents)
      .innerJoin(patients, eq(patients.id, documents.patientId))
      .where(and(eq(documents.id, documentId), eq(patients.userId, ctx.userId))).limit(1);
  const row = rows[0];
  if (!row) throw new Error("Documento não autorizado ou inexistente");
  return "document" in row ? row.document : row;
}

export async function ingestClinicalDocument(
  ctx: AiAccessContext,
  documentId: number,
  dbOverride?: Db,
): Promise<{ documentId: number; chunks: number; extractedCharacters: number }> {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  const document = await authorizedDocument(db, ctx, documentId);
  const buffer = await downloadPrivateDocument(document);
  const extracted = await extractClinicalDocument(buffer, document.fileType, document.fileName);
  if (!extracted.length) throw new Error("Não foi possível extrair texto do documento");

  const texts = extracted.map(chunk => chunk.content);
  const embeddings = await embeddingForCurrentEnvironment().getTextEmbeddings(texts);
  if (embeddings.length !== extracted.length) throw new Error("Provider retornou quantidade inválida de embeddings");

  await db.delete(aiDocumentChunks).where(eq(aiDocumentChunks.documentId, document.id));
  await db.insert(aiDocumentChunks).values(extracted.map((chunk, index) => ({
    documentId: document.id,
    patientId: document.patientId,
    therapistId: document.therapistId,
    chunkIndex: index,
    content: chunk.content,
    contentHash: createHash("sha256").update(chunk.content).digest("hex"),
    embedding: embeddings[index],
    pageNumber: chunk.pageNumber,
    metadata: { extractor: "pdf-parse/mammoth", version: 1 },
  })));

  return {
    documentId: document.id,
    chunks: extracted.length,
    extractedCharacters: texts.reduce((sum, text) => sum + text.length, 0),
  };
}

export async function searchIndexedDocumentChunks(
  ctx: AiAccessContext,
  queryEmbedding: number[],
  patientId: number | undefined,
  topK = 8,
  dbOverride?: Db,
) {
  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");
  if (ctx.role === "admin") throw new Error("Administrador não possui acesso a prontuários pelo agente");
  if (ctx.role === "therapist" && (ctx.therapistId == null || patientId == null)) {
    throw new Error("Busca clínica exige terapeuta e patientId válidos");
  }
  if (ctx.role !== "therapist" && patientId !== ctx.patientId) throw new Error("Paciente não autorizado");

  const vector = vectorLiteral(queryEmbedding);
  const distance = sql<number>`${aiDocumentChunks.embedding} <=> ${vector}::vector`;
  const scope = ctx.role === "therapist"
    ? and(eq(aiDocumentChunks.therapistId, ctx.therapistId as number), eq(aiDocumentChunks.patientId, patientId as number))
    : eq(aiDocumentChunks.patientId, ctx.patientId as number);

  return db.select({
    id: aiDocumentChunks.id,
    documentId: aiDocumentChunks.documentId,
    patientId: aiDocumentChunks.patientId,
    content: aiDocumentChunks.content,
    pageNumber: aiDocumentChunks.pageNumber,
    distance,
  }).from(aiDocumentChunks).where(scope).orderBy(asc(distance)).limit(Math.min(topK, 20));
}
