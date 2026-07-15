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

const AVATARS_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp"];

/**
 * Envia a foto de perfil e devolve o path no Storage.
 *
 * Path fixo por usuário (`<uid>/avatar.<ext>`) com upsert: trocar a foto
 * substitui a anterior em vez de acumular lixo no bucket. O bucket é privado —
 * exibir exige `getAvatarSignedUrl`.
 */
export async function uploadAvatarFile(file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase não configurado.");

  if (!AVATAR_MIME.includes(file.type)) {
    throw new Error("Formato não aceito. Envie uma imagem JPG, PNG ou WEBP.");
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new Error("Imagem muito grande. O limite é 5 MB.");
  }

  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Faça login para enviar a foto.");

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/avatar.${ext}`;

  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;

  return path;
}

/** URL assinada temporária para exibir a foto de perfil. */
export async function getAvatarSignedUrl(path: string): Promise<string | null> {
  if (!supabase || !path) return null;
  const { data } = await supabase.storage.from(AVATARS_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function removeAvatarFile(path: string): Promise<void> {
  if (!supabase || !path) return;
  await supabase.storage.from(AVATARS_BUCKET).remove([path]);
}
