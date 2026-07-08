-- RLS (Row-Level Security) para o SAS no Supabase.
--
-- Arquitetura: TODO o acesso ao banco passa pelo backend (tRPC → postgres-js),
-- que conecta com um papel privilegiado (dono das tabelas / service role) e,
-- portanto, NÃO é afetado por RLS quando a política não é FORCE. Como não há
-- acesso direto do cliente ao Postgres/PostgREST, habilitar RLS sem criar
-- políticas para `anon`/`authenticated` deixa as tabelas trancadas para acesso
-- direto pela API pública, resolvendo o alerta "rls_disabled_in_public" do
-- Supabase — sem quebrar o backend.
--
-- (Se um dia o frontend passar a acessar o Supabase direto com a publishable key,
--  aí sim será preciso adicionar políticas explícitas por papel/paciente.)

ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapists   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sessionNotes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."videoCalls" ENABLE ROW LEVEL SECURITY;
