-- Service-role uploads only. Public images and private documents use separate buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('event-media', 'event-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('private-files', 'private-files', false, 10485760, null)
on conflict do nothing;

create policy "tikatero_public_media_read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'event-media');
-- Restrictive guards also protect these buckets if a broader permissive policy is added later.
create policy "tikatero_private_files_no_client_read" on storage.objects
  as restrictive for select to anon, authenticated using (bucket_id <> 'private-files');
create policy "tikatero_storage_no_client_insert" on storage.objects
  as restrictive for insert to anon, authenticated
  with check (bucket_id not in ('event-media', 'private-files'));
create policy "tikatero_storage_no_client_update" on storage.objects
  as restrictive for update to anon, authenticated
  using (bucket_id not in ('event-media', 'private-files'))
  with check (bucket_id not in ('event-media', 'private-files'));
create policy "tikatero_storage_no_client_delete" on storage.objects
  as restrictive for delete to anon, authenticated
  using (bucket_id not in ('event-media', 'private-files'));

comment on column public.tickets.pdf_key is 'Private Supabase Storage object path. Not granted to browser roles.';
comment on column public.kyc_applications.doc_keys is 'Private Supabase Storage object paths. Not granted to anon or authenticated.';
