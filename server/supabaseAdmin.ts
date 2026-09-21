import { createClient } from "@supabase/supabase-js";

/**
 * Cliente ADMIN do Supabase (service role) para operações de conta no servidor.
 *
 * Usado pela troca de e-mail por código: depois que o NOSSO fluxo confirma o
 * código (enviado aos dois e-mails), trocamos o e-mail direto por aqui, já
 * confirmado (`email_confirm: true`), sem depender do e-mail de confirmação do
 * Supabase (que exige SMTP customizado para editar o template).
 */
function adminClient(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Troca o e-mail de um usuário do Supabase (pelo uid), já marcado como confirmado. */
export async function trocarEmailSupabase(authUid: string, novoEmail: string): Promise<void> {
  const client = adminClient();
  if (!client) throw new Error("Serviço de conta indisponível.");
  const { error } = await client.auth.admin.updateUserById(authUid, {
    email: novoEmail,
    email_confirm: true,
  });
  if (error) throw error;
}
