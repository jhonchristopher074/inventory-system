-- =====================================================================
-- Every delivery gets its receipt
-- ---------------------------------------------------------------------
-- Run after 20261106000001_staff_owner_receipt_uploads.sql.
--
-- The rule: only a receipt puts stock in (scanner -> Prices to check ->
-- Confirm). A Calendar delivery is just the goods arriving, so every
-- delivery now ends up linked to its receipt:
--
--   Mark as delivered (staff) asks "Did the receipt come with the goods?"
--     yes  the staff member uploads it right there: it's linked to the
--          delivery and goes to the owner like any staff upload
--     no   the delivery is "Arrived · waiting for receipt": a task for the
--          owner until a receipt is linked (the bell says so)
--   The receipt comes later (supplier upload, staff, owner): when the owner
--   approves it (or uploads it himself) he picks the delivery it's for.
--   A denied receipt puts its delivery back to "waiting for receipt".
--
-- deliveries:       needs_receipt (marked delivered the new way), upload_id
-- supplier_uploads: delivery_id
-- list_deliveries gives receipt_state: none | waiting | sent | done.
-- Deliveries marked delivered before this file stay as they were.
--
-- Safe to run more than once.
-- =====================================================================

begin;

alter table public.deliveries
  add column if not exists needs_receipt boolean not null default false,
  add column if not exists upload_id     bigint;

alter table public.supplier_uploads
  add column if not exists delivery_id bigint;

-- one receipt per delivery, one delivery per receipt
create unique index if not exists deliveries_one_receipt
  on public.deliveries (upload_id) where upload_id is not null;
create unique index if not exists supplier_uploads_one_delivery
  on public.supplier_uploads (delivery_id) where delivery_id is not null;

-- ---------------------------------------------------------------------
-- The deliveries, with where their receipt is
-- ---------------------------------------------------------------------
create or replace function public.list_deliveries()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin', 'staff']);

  select coalesce(jsonb_agg(
           to_jsonb(d) || jsonb_build_object(
             'receipt_state',
               case
                 when su.id is not null and su.status = 'approved'
                      and exists (select 1 from receipt_review_items i
                                   where i.upload_ref = su.id::text and i.decision = 'approved')
                      and not exists (select 1 from receipt_review_items i
                                       where i.upload_ref = su.id::text and i.status = 'pending')
                   then 'done'
                 when su.id is not null and su.status <> 'rejected' then 'sent'
                 when d.needs_receipt and lower(coalesce(d.status, '')) = 'delivered' then 'waiting'
                 else 'none'
               end,
             'receipt_file', su.file_name,
             'receipt_upload_status', su.status)
           order by d.delivery_date asc, d.id), '[]'::jsonb)
    into v_rows
    from deliveries d
    left join supplier_uploads su on su.id = d.upload_id;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- The goods came, the receipt didn't (staff or owner)
-- ---------------------------------------------------------------------
create or replace function public.mark_delivery_no_receipt(p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d      deliveries%rowtype;
  v_name text;
begin
  perform public.require_role(array['staff', 'admin']);

  select * into d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'That delivery was not found.';
  end if;
  if lower(coalesce(d.status, '')) = 'delivered' then
    raise exception 'This delivery was already marked as delivered.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = auth.uid();

  update deliveries
     set status = 'Delivered',
         delivered_at = now(),
         delivered_by = v_name,
         needs_receipt = true
   where id = d.id;

  if not public.is_admin() then
    insert into notifications (title, message, type, is_read, recipient_role)
    values (
      'Delivery without receipt',
      format('%s (from %s) arrived, marked by %s, but its receipt didn''t come. No stock is added until it does: upload it or link it when it comes.',
        d.title, coalesce(nullif(btrim(d.supplier), ''), 'the supplier'), coalesce(v_name, 'a staff member')),
      'delivery_receipt', false, 'admin');
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Owner: "this receipt is for that delivery"
-- ---------------------------------------------------------------------
create or replace function public.admin_link_delivery_receipt(p_upload_id bigint, p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d  deliveries%rowtype;
  su supplier_uploads%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select * into d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'That delivery was not found.';
  end if;
  if d.upload_id is not null then
    raise exception 'That delivery already has its receipt.';
  end if;

  select * into su from supplier_uploads where id = p_upload_id for update;
  if not found or su.status = 'rejected' then
    raise exception 'That receipt was not found or was denied.';
  end if;
  if su.delivery_id is not null then
    raise exception 'That receipt is already linked to a delivery.';
  end if;

  update supplier_uploads set delivery_id = d.id where id = su.id;
  update deliveries
     set upload_id = su.id,
         -- linked before anyone pressed "Mark as delivered": the goods are here
         status = 'Delivered',
         delivered_at = coalesce(delivered_at, now()),
         needs_receipt = true
   where id = d.id;
end;
$function$;

-- ---------------------------------------------------------------------
-- Upload a receipt (staff / owner), now with the delivery it's for.
-- Replaces the 5-argument version of 20261106000001.
-- ---------------------------------------------------------------------
drop function if exists public.submit_receipt_upload(text, text, text, text, text);

create or replace function public.submit_receipt_upload(
  p_file_name     text,
  p_file_path     text,
  p_file_hash     text,
  p_supplier_name text,
  p_note          text default null,
  p_delivery_id   bigint default null
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
  v_delivery  deliveries%rowtype;
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

  if p_file_path is null or p_file_path !~ '^notifications/[A-Za-z0-9_-]+\.(png|jpg|jpeg|pdf)$' then
    raise exception 'Please upload the receipt from the app.';
  end if;

  if not exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'supplierReceipt'
       and o.name = p_file_path
       and o.owner_id = auth.uid()::text
  ) then
    raise exception 'The uploaded file was not found. Please upload it again.';
  end if;

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

  -- the delivery it's for (its goods are here)
  if p_delivery_id is not null then
    select * into v_delivery from deliveries where id = p_delivery_id for update;
    if not found then
      raise exception 'That delivery was not found.';
    end if;
    if v_delivery.upload_id is not null then
      raise exception 'That delivery already has its receipt.';
    end if;
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = auth.uid();

  insert into supplier_uploads (
    supplier_id, file_name, file_path, file_url, file_hash,
    uploader_role, supplier_name, note, delivery_id,
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
    p_delivery_id,
    case when v_owner then 'approved' else 'pending' end,
    case when v_owner then now() end,
    case when v_owner then auth.uid() end
  )
  returning * into v_row;

  if p_delivery_id is not null then
    update deliveries
       set upload_id = v_row.id,
           status = 'Delivered',
           delivered_at = coalesce(delivered_at, now()),
           delivered_by = coalesce(delivered_by, v_name),
           needs_receipt = true
     where id = p_delivery_id;
  end if;

  if not v_owner then
    perform public.notify(
      'Receipt to approve',
      format('%s (staff) uploaded %s, a receipt from %s%s.%s',
        coalesce(v_name, 'A staff member'), v_row.file_name, v_supplier,
        case when p_delivery_id is not null then format(' for the delivery "%s"', v_delivery.title) else '' end,
        coalesce(' Note: ' || v_note, '')),
      'supplier_upload',
      null,
      null
    );
  end if;

  return to_jsonb(v_row);
end;
$function$;

-- taking back an upload frees its delivery again
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

  update deliveries set upload_id = null
   where upload_id = p_upload_id
     and exists (select 1 from supplier_uploads
                  where id = p_upload_id and supplier_id = auth.uid() and status = 'pending');

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

-- a denied receipt: its delivery waits for a receipt again
create or replace function public.supplier_uploads_free_delivery()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' and new.delivery_id is not null then
    update deliveries set upload_id = null where id = new.delivery_id and upload_id = new.id;
    new.delivery_id := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists supplier_uploads_free_delivery on public.supplier_uploads;
create trigger supplier_uploads_free_delivery
  before update of status on public.supplier_uploads
  for each row execute function public.supplier_uploads_free_delivery();

-- ---------------------------------------------------------------------
-- The owner's upload list: which delivery a receipt is for
-- (as in 20261106000001, plus delivery_title)
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
             'uploader_role', coalesce(su.uploader_role, 'supplier'),
             'delivery_title', d.title)
           order by su.created_at desc), '[]'::jsonb)
    into v_rows
    from supplier_uploads su
    join profiles p on p.id = su.supplier_id
    left join deliveries d on d.id = su.delivery_id
   where p_status is null or su.status = p_status;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.list_deliveries() from public, anon;
revoke execute on function public.mark_delivery_no_receipt(bigint) from public, anon;
revoke execute on function public.admin_link_delivery_receipt(bigint, bigint) from public, anon;
revoke execute on function public.submit_receipt_upload(text, text, text, text, text, bigint) from public, anon;
revoke execute on function public.cancel_my_receipt_upload(bigint) from public, anon;
revoke execute on function public.admin_list_supplier_uploads(text) from public, anon;
revoke execute on function public.supplier_uploads_free_delivery() from public, anon, authenticated;

grant execute on function public.list_deliveries() to authenticated;
grant execute on function public.mark_delivery_no_receipt(bigint) to authenticated;
grant execute on function public.admin_link_delivery_receipt(bigint, bigint) to authenticated;
grant execute on function public.submit_receipt_upload(text, text, text, text, text, bigint) to authenticated;
grant execute on function public.cancel_my_receipt_upload(bigint) to authenticated;
grant execute on function public.admin_list_supplier_uploads(text) to authenticated;

commit;

-- check: the deliveries and where their receipt is
select id, title, status, needs_receipt, upload_id
  from public.deliveries
 order by delivery_date desc
 limit 10;
