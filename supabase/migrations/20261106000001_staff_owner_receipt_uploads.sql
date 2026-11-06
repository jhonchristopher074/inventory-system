-- =====================================================================
-- Receipts uploaded by staff and by the owner
-- ---------------------------------------------------------------------
-- Run after 20261105000001_refund_no_approval.sql.
--
-- Sometimes the supplier hands the paper receipt to a staff member or to
-- the owner instead of uploading it. Now they can upload a photo (or PDF)
-- of it themselves:
--   staff   Supplier Receipts page: it waits for the owner, exactly like a
--           supplier's upload (Approval > Receipts to approve). The staff
--           member sees its status and gets "approved" / "denied" in the
--           bell.
--   owner   Approval > Upload receipt: no approval needed, it goes straight
--           to the receipt scanner (with the profit percentage).
--
-- The receipt goes into supplier_uploads like every other one, so the rest
-- works unchanged: the receipt scanner (n8n), Prices to check, Not
-- delivered yet, Documentation, the duplicate check (the same file can't
-- be uploaded twice). New columns:
--   uploader_role  'supplier' (as before), 'staff' or 'admin'
--   supplier_name  which supplier the paper receipt is from (staff / owner
--                  uploads; a supplier's own upload uses their account
--                  name). Receiving already shows it ("from ...").
--   note           a note from the staff member for the owner
-- supplier_id stays "who uploaded it" (the supplier, staff member or owner).
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------
alter table public.supplier_uploads
  add column if not exists uploader_role text not null default 'supplier',
  add column if not exists supplier_name text,
  add column if not exists note          text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'supplier_uploads_uploader_role_check') then
    alter table public.supplier_uploads
      add constraint supplier_uploads_uploader_role_check
      check (uploader_role in ('supplier', 'staff', 'admin'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Storage: staff and the owner may put a receipt in supplierReceipt too
-- (reading / deleting stays "the one who uploaded it, or the owner")
-- ---------------------------------------------------------------------
drop policy if exists "supplierReceipt: supplier uploads" on storage.objects;
drop policy if exists "supplierReceipt: supplier, staff or owner uploads" on storage.objects;

create policy "supplierReceipt: supplier, staff or owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplierReceipt'
    and public.get_my_role() in ('supplier', 'staff', 'admin')
  );

-- ---------------------------------------------------------------------
-- Upload a receipt (staff: waits for the owner; owner: approved at once,
-- the app then sends it to the scanner). Same checks as a supplier's
-- upload (supplier_submit_upload), plus the supplier's name.
-- ---------------------------------------------------------------------
create or replace function public.submit_receipt_upload(
  p_file_name     text,
  p_file_path     text,
  p_file_hash     text,
  p_supplier_name text,
  p_note          text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_owner     boolean;
  v_supplier  text := nullif(btrim(coalesce(p_supplier_name, '')), '');
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_row       supplier_uploads%rowtype;
  v_previous  supplier_uploads%rowtype;
  v_name      text;
begin
  perform public.require_role(array['staff', 'admin']);
  v_owner := public.is_admin();

  if p_file_name is null or btrim(p_file_name) = '' then
    raise exception 'Missing file name.';
  end if;

  if v_supplier is null then
    raise exception 'Write which supplier the receipt is from.';
  end if;
  if length(v_supplier) > 120 then
    raise exception 'The supplier''s name is too long (120 characters at most).';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'The note is too long (300 characters at most).';
  end if;

  -- the app's own file names only ...
  if p_file_path is null or p_file_path !~ '^notifications/[A-Za-z0-9_-]+\.(png|jpg|jpeg|pdf)$' then
    raise exception 'Please upload the receipt from the app.';
  end if;

  -- ... of a file this person really put in the receipt bucket
  if not exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'supplierReceipt'
       and o.name = p_file_path
       and o.owner_id = auth.uid()::text
  ) then
    raise exception 'The uploaded file was not found. Please upload it again.';
  end if;

  -- the receipt's fingerprint (SHA-256): the same receipt can't reach the
  -- scanner twice (its stock would be added twice)
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

  insert into supplier_uploads (
    supplier_id, file_name, file_path, file_url, file_hash,
    uploader_role, supplier_name, note,
    status, reviewed_at, reviewed_by
  )
  values (
    auth.uid(),
    btrim(p_file_name),
    p_file_path,
    'https://dvtnrfhsxabtcmpgojnn.supabase.co/storage/v1/object/public/supplierReceipt/' || p_file_path,
    p_file_hash,
    case when v_owner then 'admin' else 'staff' end,
    v_supplier,
    v_note,
    -- the owner's own upload needs no approval
    case when v_owner then 'approved' else 'pending' end,
    case when v_owner then now() end,
    case when v_owner then auth.uid() end
  )
  returning * into v_row;

  -- a staff member's: the owner gets it in the bell, like a supplier's
  if not v_owner then
    select coalesce(nullif(btrim(full_name), ''), email, 'A staff member')
      into v_name
      from profiles
     where id = auth.uid();

    perform public.notify(
      'Receipt to approve',
      format('%s (staff) uploaded %s, a receipt from %s.%s',
        v_name, v_row.file_name, v_supplier,
        coalesce(' Note: ' || v_note, '')),
      'supplier_upload',
      null,
      null
    );
  end if;

  return to_jsonb(v_row);
end;
$function$;

-- ---------------------------------------------------------------------
-- Staff: take back an upload the owner hasn't looked at yet (e.g. the
-- wrong picture). The app then deletes its file.
-- ---------------------------------------------------------------------
create or replace function public.cancel_my_receipt_upload(p_upload_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row supplier_uploads%rowtype;
begin
  perform public.require_role(array['staff', 'admin']);

  delete from supplier_uploads
   where id = p_upload_id
     and supplier_id = auth.uid()
     and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'This receipt was already approved or denied, so it can''t be taken back.';
  end if;

  return to_jsonb(v_row);
end;
$function$;

-- ---------------------------------------------------------------------
-- Staff (and owner): their own uploads, newest first. "added" = the
-- receipt's products were confirmed (all of them, none still waiting).
-- ---------------------------------------------------------------------
create or replace function public.list_my_receipt_uploads(p_limit integer default 200)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['staff', 'admin']);

  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select su.id, su.file_name, su.file_path, su.status, su.created_at, su.reviewed_at,
           su.forwarded_at, su.supplier_name, su.note,
           case
             when su.send_at is null then null
             else ceil(extract(epoch from su.send_at - now()))::integer
           end as seconds_to_send,
           (select count(*) from receipt_review_items i
             where i.upload_ref = su.id::text and i.decision = 'approved') as products_added,
           (exists (select 1 from receipt_review_items i
                     where i.upload_ref = su.id::text and i.decision = 'approved')
            and not exists (select 1 from receipt_review_items i
                             where i.upload_ref = su.id::text and i.status = 'pending')) as added
      from supplier_uploads su
     where su.supplier_id = auth.uid()
     order by su.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500)
  ) u;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- Supplier names to pick from when uploading: the supplier accounts, and
-- the names already written on earlier uploads
-- ---------------------------------------------------------------------
create or replace function public.list_receipt_supplier_names()
 returns table (name text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select distinct n.name
    from (
      select nullif(btrim(p.full_name), '') as name
        from profiles p
       where p.role = 'supplier' and coalesce(p.is_active, true)
      union
      select nullif(btrim(su.supplier_name), '')
        from supplier_uploads su
       where su.created_at > now() - interval '1 year'
    ) n
   where n.name is not null
     and public.get_my_role() in ('staff', 'admin')
   order by n.name
   limit 300;
$function$;

-- ---------------------------------------------------------------------
-- The owner's lists: who uploaded it and where the paper came from
-- (same output as before, plus uploader_role, uploader_name, note)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_supplier_uploads(p_status text default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(
           to_jsonb(su) || jsonb_build_object(
             'supplier_name', coalesce(nullif(btrim(su.supplier_name), ''), p.full_name),
             'supplier_email', p.email,
             'uploader_name', coalesce(nullif(btrim(p.full_name), ''), p.email),
             'uploader_role', coalesce(su.uploader_role, 'supplier'))
           order by su.created_at desc), '[]'::jsonb)
    into v_rows
    from supplier_uploads su
    join profiles p on p.id = su.supplier_id
   where p_status is null or su.status = p_status;

  return v_rows;
end;
$function$;

create or replace function public.admin_list_unsent_supplier_uploads()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(
           to_jsonb(su) || jsonb_build_object(
             'supplier_name', coalesce(nullif(btrim(su.supplier_name), ''), p.full_name),
             'supplier_email', p.email,
             'uploader_name', coalesce(nullif(btrim(p.full_name), ''), p.email),
             'uploader_role', coalesce(su.uploader_role, 'supplier'))
           order by su.reviewed_at desc nulls last), '[]'::jsonb)
    into v_rows
    from supplier_uploads su
    left join profiles p on p.id = su.supplier_id
   where su.status = 'approved'
     and su.forwarded_at is null;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- A staff member's receipt approved or denied: told in the bell
-- ---------------------------------------------------------------------
create or replace function public.supplier_uploads_tell_staff()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if new.uploader_role = 'staff'
     and old.status = 'pending'
     and new.status in ('approved', 'rejected') then
    select coalesce(nullif(btrim(full_name), ''), email, 'A staff member')
      into v_name
      from profiles
     where id = new.supplier_id;

    insert into public.notifications (title, message, type, is_read, recipient_role)
    values (
      case when new.status = 'approved' then 'Receipt approved' else 'Receipt denied' end,
      case when new.status = 'approved'
        then format('The owner approved %s (from %s), uploaded by %s. It goes to the receipt scanner.',
               new.file_name, coalesce(new.supplier_name, 'a supplier'), v_name)
        else format('The owner denied %s (from %s), uploaded by %s.',
               new.file_name, coalesce(new.supplier_name, 'a supplier'), v_name)
      end,
      'receipt', false, 'staff');
  end if;

  return new;
end;
$function$;

drop trigger if exists supplier_uploads_tell_staff on public.supplier_uploads;
create trigger supplier_uploads_tell_staff
  after update of status on public.supplier_uploads
  for each row execute function public.supplier_uploads_tell_staff();

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.submit_receipt_upload(text, text, text, text, text) from public, anon;
revoke execute on function public.cancel_my_receipt_upload(bigint) from public, anon;
revoke execute on function public.list_my_receipt_uploads(integer) from public, anon;
revoke execute on function public.list_receipt_supplier_names() from public, anon;
revoke execute on function public.admin_list_supplier_uploads(text) from public, anon;
revoke execute on function public.admin_list_unsent_supplier_uploads() from public, anon;
revoke execute on function public.supplier_uploads_tell_staff() from public, anon, authenticated;

grant execute on function public.submit_receipt_upload(text, text, text, text, text) to authenticated;
grant execute on function public.cancel_my_receipt_upload(bigint) to authenticated;
grant execute on function public.list_my_receipt_uploads(integer) to authenticated;
grant execute on function public.list_receipt_supplier_names() to authenticated;
grant execute on function public.admin_list_supplier_uploads(text) to authenticated;
grant execute on function public.admin_list_unsent_supplier_uploads() to authenticated;

commit;

-- check: the new columns (every earlier upload is a supplier's)
select uploader_role, count(*) as uploads
  from public.supplier_uploads
 group by uploader_role;
