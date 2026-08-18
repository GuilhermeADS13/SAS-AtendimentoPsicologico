import { BaseEmbedding, Document, Settings, VectorStoreIndex } from "llamaindex";
import { and, asc, desc, eq } from "drizzle-orm";
import { documents, patients, sessions, type Patient, type Session, type Document as ClinicalDocument } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AiAccessContext } from "./access";
import { rerankClinicalSources } from "./rerank";

export type ScopedClinicalQuery = {
  query: string;
  patientId?: number;
  topK?: number;
};

export type RagSource = {
  sourceType: "patient" | "session" | "document";
  sourceId: number;
  patientId: number;
  text: string;
  score?: number;
  requiresReview: boolean;
};

class OpenAICompatibleEmbedding extends BaseEmbedding {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: { baseUrl: string; apiKey: string; model: string }) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: text }),
    });

    if (!response.ok) {
      throw new Error(`Embedding provider respondeu ${response.status}`);
    }

    const payload = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!embedding?.length) throw new Error("Embedding provider não retornou vetor");
    return embedding;
  }
}

export function embeddingForCurrentEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return new OpenAICompatibleEmbedding({
    baseUrl: env.LLM_EMBEDDING_BASE_URL ?? env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    // Chave PRÓPRIA para embeddings (cai em LLM_API_KEY se não houver): permite
    // usar um provedor gratuito de embeddings (ex.: Cloudflare/Google, 768d)
    // junto de outro provedor no chat (ex.: Groq grátis) — cada um com sua chave.
    apiKey: env.LLM_EMBEDDING_API_KEY ?? env.LLM_API_KEY ?? "ollama",
    model: env.LLM_EMBEDDING_MODEL ?? "nomic-embed-text",
  });
}

function patientText(patient: Patient): string {
  return [
    `Paciente: ${patient.firstName} ${patient.lastName}`,
    `Status: ${patient.status}`,
    patient.medicalHistory ? `Histórico informado: ${patient.medicalHistory}` : "",
  ].filter(Boolean).join("\n");
}

function sessionText(session: Session): string {
  return [
    `Sessão realizada em ${session.startedAt.toISOString()}`,
    session.mood ? `Humor registrado: ${session.mood}` : "",
    session.clinicalNotes ? `Notas clínicas: ${session.clinicalNotes}` : "",
    session.treatment ? `Tratamento registrado: ${session.treatment}` : "",
    session.nextSteps ? `Próximos passos registrados: ${session.nextSteps}` : "",
  ].filter(Boolean).join("\n");
}

function documentText(document: ClinicalDocument): string {
  return [
    `Documento: ${document.fileName}`,
    `Tipo: ${document.documentType}`,
    document.description ? `Descrição: ${document.description}` : "",
    `Criado em: ${document.createdAt.toISOString()}`,
  ].filter(Boolean).join("\n");
}

function assertClinicalQueryAccess(ctx: AiAccessContext, patientId?: number): void {
  if (ctx.role === "admin") throw new Error("Acesso clínico do agente não está disponível para administradores");
  if (ctx.role === "therapist" && patientId == null) {
    throw new Error("A busca clínica para terapeuta exige patientId");
  }
  if ((ctx.role === "patient" || ctx.role === "user") && patientId != null && ctx.patientId !== patientId) {
    throw new Error("Paciente não autorizado");
  }
}

/**
 * A autorização acontece antes da criação do índice vetorial. Assim, nenhum
 * vetor de outro prontuário chega ao LlamaIndex ou ao modelo.
 */
export async function retrieveScopedClinicalContext(
  ctx: AiAccessContext,
  input: ScopedClinicalQuery,
  dbOverride?: NonNullable<Awaited<ReturnType<typeof getDb>>>,
): Promise<RagSource[]> {
  const query = input.query.trim();
  if (!query) return [];
  assertClinicalQueryAccess(ctx, input.patientId);

  const db = dbOverride ?? await getDb();
  if (!db) throw new Error("Database not available");

  let patientRows: Patient[];
  if (ctx.role === "therapist") {
    patientRows = await db.select().from(patients).where(
      and(eq(patients.therapistId, ctx.therapistId as number), eq(patients.id, input.patientId as number)),
    );
  } else {
    patientRows = await db.select().from(patients).where(eq(patients.userId, ctx.userId));
  }
  if (!patientRows.length) return [];

  const patientIds = patientRows.map(patient => patient.id);
  const authorizedPatient = patientRows[0];
  const sessionRows = await db.select().from(sessions).where(
    and(
      eq(sessions.patientId, patientIds[0]),
      eq(sessions.therapistId, authorizedPatient.therapistId),
    ),
  ).orderBy(desc(sessions.startedAt)).limit(100);
  const documentRows = await db.select().from(documents).where(
    and(
      eq(documents.patientId, patientIds[0]),
      eq(documents.therapistId, authorizedPatient.therapistId),
    ),
  ).orderBy(desc(documents.createdAt)).limit(100);

  const sourceById = new Map<string, RagSource>();
  const llamaDocuments = [
    ...patientRows.map(patient => {
      const text = patientText(patient);
      const source = { sourceType: "patient" as const, sourceId: patient.id, patientId: patient.id, text, requiresReview: false };
      sourceById.set(`patient:${patient.id}`, source);
      return new Document({ text, metadata: { sourceType: source.sourceType, sourceId: patient.id, patientId: patient.id } });
    }),
    ...sessionRows.map(session => {
      const text = sessionText(session);
      const source = { sourceType: "session" as const, sourceId: session.id, patientId: session.patientId, text, requiresReview: false };
      sourceById.set(`session:${session.id}`, source);
      return new Document({ text, metadata: { sourceType: source.sourceType, sourceId: session.id, patientId: session.patientId } });
    }),
    ...documentRows.map(document => {
      const text = documentText(document);
      const source = { sourceType: "document" as const, sourceId: document.id, patientId: document.patientId, text, requiresReview: false };
      sourceById.set(`document:${document.id}`, source);
      return new Document({ text, metadata: { sourceType: source.sourceType, sourceId: document.id, patientId: document.patientId } });
    }),
  ];

  if (!llamaDocuments.length) return [];
  const index = await Settings.withEmbedModel(
    embeddingForCurrentEnvironment(),
    () => VectorStoreIndex.fromDocuments(llamaDocuments),
  );
  const nodes = await index.asRetriever({ similarityTopK: Math.min(input.topK ?? 5, 8) }).retrieve(query);

  const retrieved: Array<RagSource | null> = nodes.map(node => {
    const metadata = node.node.metadata as { sourceType?: RagSource["sourceType"]; sourceId?: number };
    const key = `${metadata.sourceType}:${metadata.sourceId}`;
    const source = sourceById.get(key);
    return source ? { ...source, score: node.score } : null;
  });
  const authorizedSources = retrieved.filter((source): source is RagSource => source !== null);
  if (process.env.AI_RAG_RERANK_ENABLED === "false") return authorizedSources.slice(0, input.topK ?? 5);
  return rerankClinicalSources(authorizedSources, query, input.topK ?? 5);
}

export function formatRagContext(sources: RagSource[]): string {
  return sources.map((source, index) =>
    `[Fonte ${index + 1} | ${source.sourceType} ${source.sourceId} | paciente ${source.patientId}]\n${source.text}`,
  ).join("\n\n");
}
