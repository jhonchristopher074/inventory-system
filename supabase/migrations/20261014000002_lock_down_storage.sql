-- =====================================================================
-- Storage fixes from the 2026-10-14 review.
-- Run AFTER 20261014000001_lock_down_database.sql.
--
-- Before: any logged-in user could upload product pictures, and read or
-- DELETE every supplier receipt. There were also two copies of each
-- supplierReceipt policy.
-- After:  only the admin uploads product pictures; only suppliers upload
-- receipts; a receipt can be read/deleted by the supplier who uploaded it
-- or by the admin.
--
-- If Supabase says "must be owner of table objects", create the same
-- policies in Storage > Policies instead.
-- =====================================================================

begin;

drop policy if exists "Allow authenticated uploads" on storage.objects;
drop policy if exists "Allow authenticated users to upload receipts" on storage.objects;
drop policy if exists "supplier-receipts delete" on storage.objects;
drop policy if exists "supplier-receipts insert" on storage.objects;
drop policy if exists "supplier-receipts select" on storage.objects;
drop policy if exists "supplierReceipt delete" on storage.objects;
drop policy if exists "supplierReceipt insert" on storage.objects;
drop policy if exists "supplierReceipt select" on storage.objects;

create policy "products: admin uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());

create policy "supplierReceipt: supplier uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'supplierReceipt' and public.get_my_role() = 'supplier');

create policy "supplierReceipt: uploader or admin reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplierReceipt'
    and (public.is_admin() or owner_id = auth.uid()::text)
  );

create policy "supplierReceipt: uploader or admin deletes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'supplierReceipt'
    and (public.is_admin() or owner_id = auth.uid()::text)
  );

-- Kept as they were:
--   "Allow public read"                   (anyone can view product pictures)
--   "admin can upload approved receipts"  (Approved Receipt bucket, admin only)

commit;
