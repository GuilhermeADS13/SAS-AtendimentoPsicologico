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

/**
 * Link de recuperação de senha, gerado aqui para o e-mail sair pela NOSSA conta
 * (Brevo), com a marca e o nome da pessoa — e não pelo e-mail padrão do Supabase.
 * O link é o mesmo de antes: abre /redefinir-senha já com a sessão de recuperação.
 * Devolve null se o e-mail não tem conta (quem chama não revela isso).
 */
export async function gerarLinkDeRecuperacao(email: string, redirectTo: string): Promise<string | null> {
  const client = adminClient();
  if (!client) throw new Error("Serviço de conta indisponível.");
  const { data, error } = await client.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  if (error) return null;
  return data.properties?.action_link ?? null;
}

/**
 * Cria a conta (ainda NÃO confirmada) e devolve o link de confirmação, para o
 * e-mail sair pela NOSSA conta (Brevo), com a marca — o e-mail padrão do Supabase,
 * no plano grátis, só chega a quem é da equipe do projeto.
 *
 * Só protege com "Confirm email" LIGADO no painel do Supabase: com ele desligado,
 * a conta já nasce confirmada e qualquer um entraria com o e-mail de outra pessoa.
 * Devolve null se o e-mail já tem conta (quem chama não revela isso).
 */
export async function gerarLinkDeCadastro(
  email: string,
  senha: string,
  dados: Record<string, string>,
  redirectTo: string,
): Promise<string | null> {
  const client = adminClient();
  if (!client) throw new Error("Serviço de conta indisponível.");
  const { data, error } = await client.auth.admin.generateLink({
    type: "signup",
    email,
    password: senha,
    options: { data: dados, redirectTo },
  });
  if (error) return null;
  return data.properties?.action_link ?? null;
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
