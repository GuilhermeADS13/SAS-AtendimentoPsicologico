-- Storage de documentos dos prontuários (Supabase Storage).
-- Bucket privado + RLS: cada usuário autenticado só acessa a própria pasta
-- (primeiro segmento do path = auth.uid(), o id do usuário no Supabase).

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents owner insert" on storage.objects;
create policy "documents owner insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents owner select" on storage.objects;
create policy "documents owner select"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documents owner delete" on storage.objects;
create policy "documents owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
