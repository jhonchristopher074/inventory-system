-- =====================================================================
-- The "documents" bucket had no upload policy, so staff document photos
-- and profile pictures failed with
--   "new row violates row-level security policy".
--
-- Staff and admin can upload; a file can be deleted by whoever uploaded
-- it (the app does this to clean up when saving fails) or by the admin.
-- Viewing works through the bucket's public URLs, so no read policy needed.
--
-- If Supabase says "must be owner of table objects", create the same
-- policies in Storage > Policies instead.
-- =====================================================================

begin;

drop policy if exists "documents: staff and admin upload" on storage.objects;
drop policy if exists "documents: uploader or admin deletes" on storage.objects;

create policy "documents: staff and admin upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.get_my_role() in ('staff', 'admin')
  );

create policy "documents: uploader or admin deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (public.is_admin() or owner_id = auth.uid()::text)
  );

commit;
