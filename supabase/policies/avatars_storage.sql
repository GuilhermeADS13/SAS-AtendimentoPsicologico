-- Fotos de perfil (Supabase Storage).
--
-- Bucket PRIVADO, igual ao de documentos. Foto de paciente de psicologia é dado
-- pessoal sensível: num bucket público, a URL vaza o rosto de quem faz terapia
-- para sempre, sem login, e não dá para "despublicar" um link que já circulou.
--
-- RLS: cada usuário só mexe na própria pasta (1º segmento do path = auth.uid()).
-- Isso cobre o caso de hoje, em que cada um vê a própria foto. Se um dia a
-- psicóloga precisar ver a foto do paciente na grade, o caminho é o backend
-- assinar a URL (service role ignora RLS) aplicando a regra real de acesso —
-- e NÃO abrir o bucket.

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

-- Update: trocar a foto sobrescreve o mesmo path (upsert).
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
