-- Fotos de perfil (Supabase Storage).
--
-- Bucket PRIVADO, igual ao de documentos. Foto de paciente de psicologia é dado
-- pessoal sensível: num bucket público, a URL vaza o rosto de quem faz terapia
-- para sempre, sem login, e não dá para "despublicar" um link que já circulou.
--
-- RLS: cada usuário só mexe na própria pasta (1º segmento do path = auth.uid()).
--
-- Exceção deliberada: a foto de quem é PSICÓLOGA é legível por qualquer usuário
-- logado. É um retrato profissional, feito para o paciente ver no perfil dela —
-- a mesma coisa que ficaria no site do consultório. Já a foto do paciente
-- continua visível só para ele.
--
-- Se um dia a psicóloga precisar ver a foto do paciente na grade, o caminho é o
-- backend assinar a URL (service role ignora RLS) aplicando a regra real de
-- acesso — e NÃO afrouxar este bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  5242880, -- 5 MB: foto de perfil não precisa de mais que isso
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner select" on storage.objects;
create policy "avatars owner select"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Precisa ser SECURITY DEFINER: a política roda como o usuário que consulta, e
-- `public.users` tem RLS sem políticas — uma subconsulta comum voltaria vazia
-- sempre, e a foto da psicóloga nunca apareceria. O `search_path` fixo impede
-- que um schema no caminho do usuário sequestre a resolução dos nomes.
create or replace function public.is_therapist_uid(uid text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    join public.therapists t on t."userId" = u.id
    where u."openId" = 'sb:' || uid
  );
$$;

revoke all on function public.is_therapist_uid(text) from public, anon;
grant execute on function public.is_therapist_uid(text) to authenticated;

-- Foto de psicóloga: legível por qualquer usuário logado (é o retrato do perfil
-- profissional que o paciente visita). Foto de paciente NÃO entra aqui.
drop policy if exists "avatars therapist photo readable" on storage.objects;
create policy "avatars therapist photo readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_therapist_uid((storage.foldername(name))[1])
  );

-- Update: trocar a foto sobrescreve o mesmo path (upsert).
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
