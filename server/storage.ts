import { createClient } from "@supabase/supabase-js";

/**
 * Assinatura de URLs do Storage privado NO SERVIDOR (service role).
 *
 * O bucket `documents` é privado e a RLS exige o uid do dono no 1º segmento do
 * path — então um lado NÃO consegue assinar (client-side) um arquivo enviado pelo
 * outro. No chat, os dois participantes precisam baixar o anexo do outro, então a
 * assinatura é feita aqui, com o service role, DEPOIS de o tRPC verificar que
 * quem pede é participante daquele thread.
 */
const DOCS_BUCKET = "documents";

function storageClient(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** URL assinada temporária para baixar um arquivo do bucket privado, ou null. */
export async function signDocumentUrl(fileKey: string, ttlSeconds = 300): Promise<string | null> {
  const client = storageClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(DOCS_BUCKET).createSignedUrl(fileKey, ttlSeconds);
  if (error) {
    console.error("Falha ao assinar URL do anexo:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Baixa um arquivo do bucket privado (service role), como Buffer, ou null. */
export async function downloadDocumentFile(fileKey: string): Promise<Buffer | null> {
  const client = storageClient();
  if (!client) return null;
  const { data, error } = await client.storage.from(DOCS_BUCKET).download(fileKey);
  if (error || !data) {
    console.error("Falha ao baixar arquivo do Storage:", error?.message ?? "vazio");
    return null;
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Remove um arquivo do bucket (best-effort; não lança). */
export async function removeDocumentFile(fileKey: string): Promise<void> {
  const client = storageClient();
  if (!client) return;
  await client.storage.from(DOCS_BUCKET).remove([fileKey]).catch(() => {});
}
