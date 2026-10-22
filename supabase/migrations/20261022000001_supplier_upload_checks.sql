-- =====================================================================
-- Supplier uploads: only real receipt files from the app
-- ---------------------------------------------------------------------
-- supplier_submit_upload stored whatever file path and link it was given.
-- A supplier account calling the database directly (outside the app)
-- could register a link to any website, and the admin's Approval page
-- opened that link inside the app while reviewing it. Now:
--   1. the file must be one this supplier really uploaded to the
--      supplierReceipt bucket, with the app's own file name format
--      (notifications/<time>-<random>.png|jpg|jpeg|pdf);
--   2. the link is built here from that file, never taken from the caller
--      (the Approval page also builds it from the file itself now);
--   3. the receipt's fingerprint is required, so the "already uploaded"
--      check can't be skipped any more (it was skipped when missing, e.g.
--      on an http:// page).
-- Same arguments as before, so the app keeps working unchanged.
--
-- Safe to run more than once.
-- =====================================================================

create or replace function public.supplier_submit_upload(p_file_name text, p_file_path text, p_file_url text, p_file_hash text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row       supplier_uploads%rowtype;
  v_previous  supplier_uploads%rowtype;
  v_supplier  text;
begin
  perform public.require_role(array['supplier']);

  if p_file_name is null or trim(p_file_name) = '' then
    raise exception 'Missing file name.';
  end if;

  -- 1. the app's own file names only ...
  if p_file_path is null or p_file_path !~ '^notifications/[A-Za-z0-9_-]+\.(png|jpg|jpeg|pdf)$' then
    raise exception 'Please upload the receipt from the app.';
  end if;

  -- ... of a file this supplier really put in the receipt bucket
  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'supplierReceipt'
      and o.name = p_file_path
      and o.owner_id = auth.uid()::text
  ) then
    raise exception 'The uploaded file was not found. Please upload it again.';
  end if;

  -- 3. the receipt's fingerprint (SHA-256, 64 hex characters)
  if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Please upload the receipt from the app, opened with https://.';
  end if;

  select * into v_previous
  from supplier_uploads
  where file_hash = p_file_hash
    and status in ('pending', 'approved')
  order by created_at
  limit 1;

  if found then
    raise exception 'This receipt was already uploaded on % and is %. Please upload a different receipt.',
      to_char(v_previous.created_at at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY'),
      case v_previous.status when 'pending' then 'waiting for approval' else 'already approved' end;
  end if;

  -- 2. the link comes from the checked file, not from the caller
  --    (this project's storage address; p_file_url is no longer used)
  insert into supplier_uploads (supplier_id, file_name, file_path, file_url, file_hash)
  values (
    auth.uid(),
    trim(p_file_name),
    p_file_path,
    'https://dvtnrfhsxabtcmpgojnn.supabase.co/storage/v1/object/public/supplierReceipt/' || p_file_path,
    p_file_hash
  )
  returning * into v_row;

  select coalesce(full_name, email, 'A supplier')
    into v_supplier
    from profiles
    where id = auth.uid();

  perform public.notify(
    'New supplier upload',
    v_supplier || ' uploaded ' || v_row.file_name,
    'supplier_upload',
    null,
    null
  );

  return to_jsonb(v_row);
end;
$function$;

-- check: should show 1 row, supplier_submit_upload with 4 arguments
select p.oid::regprocedure as function
from pg_proc p
where p.proname = 'supplier_submit_upload';
