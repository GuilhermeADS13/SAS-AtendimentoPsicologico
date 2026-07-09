import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// Só cria o cliente se as variáveis estiverem configuradas. Quando ausente,
// `supabase` é null e a UI de login mostra uma mensagem em vez de quebrar.
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export const isSupabaseConfigured = Boolean(url && key);

/** Retorna o access token da sessão atual (ou null), para as chamadas ao backend. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

const DOCS_BUCKET = "documents";

/** Faz upload de um documento e devolve o path (fileKey) no Storage. */
export async function uploadDocumentFile(patientId: number, file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Faça login com Supabase para enviar documentos.");
  // Path namespaced por usuário (a RLS do bucket exige o uid no 1º segmento).
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${uid}/${patientId}/${Date.now()}_${safeName}`;
  const { error } = await supabase.storage.from(DOCS_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

/** Gera uma URL assinada temporária para baixar/visualizar o documento. */
export async function getDocumentSignedUrl(path: string): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(path, 60 * 5);
  return data?.signedUrl ?? null;
}

/** Remove o arquivo do Storage. */
export async function removeDocumentFile(path: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(DOCS_BUCKET).remove([path]);
}
