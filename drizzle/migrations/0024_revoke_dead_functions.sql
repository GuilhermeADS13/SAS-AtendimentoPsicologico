-- Segurança: duas funções SECURITY DEFINER estavam executáveis por anon/
-- authenticated via PostgREST, sem uso real. São resquício de policies RLS que
-- nunca foram criadas — o acesso ao banco é feito pelo backend (Drizzle), não
-- pelo PostgREST. O advisor de segurança do Supabase apontou as duas.
--
-- Revoga o EXECUTE de PUBLIC/anon/authenticated. postgres e service_role (donos)
-- seguem podendo, e o event trigger que usa rls_auto_enable roda no contexto do
-- DDL, então não precisa de EXECUTE público. Reversível.
--
-- Aplicada em produção via Supabase (apply_migration) com autorização; este
-- arquivo mantém o repositório como histórico completo.
REVOKE EXECUTE ON FUNCTION public.is_therapist_uid(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
