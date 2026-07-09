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
