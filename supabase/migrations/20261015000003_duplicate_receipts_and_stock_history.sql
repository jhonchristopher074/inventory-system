-- =====================================================================
-- 2026-10-15 (run AFTER the two other 20261015 files)
--
-- A. The same receipt file can't be uploaded twice.
--    Uploading and approving the same receipt again sent it to the
--    receipt scanner (n8n) again: its stock was added twice and
--    duplicate products were created. The app now sends a fingerprint
--    (SHA-256) of each file; a file that is already pending or approved
--    is refused. (A rejected file may be uploaded again.)
--    Only uploads from now on have a fingerprint.
--
-- B. Stock history.
--    Every change to a product's stock is recorded: old and new number,
--    when, who, and why (sale, stock added, quantity edited, inspection
--    return, new product, or the receipt scanner). It's recorded by the
--    database itself, so changes made by n8n are included too.
--    History starts when this file is run.
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- A. Duplicate receipts
-- ---------------------------------------------------------------------

alter table public.supplier_uploads
  add column if not exists file_hash text;

-- Safety net for two identical uploads at the same moment.
create unique index if not exists supplier_uploads_one_per_file
  on public.supplier_uploads (file_hash)
  where file_hash is not null and status in ('pending', 'approved');

-- Same as before, plus the fingerprint check. (Replaces the 3-argument
-- version, so the check can't be skipped by calling the old one.)
drop function if exists public.supplier_submit_upload(text, text, text);

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

  if p_file_path is null or trim(p_file_path) = '' then
    raise exception 'Missing file path.';
  end if;

  if p_file_url is null or trim(p_file_url) = '' then
    raise exception 'Missing file URL.';
  end if;

  if p_file_hash is not null then
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
  end if;

  insert into supplier_uploads (supplier_id, file_name, file_path, file_url, file_hash)
  values (auth.uid(), trim(p_file_name), p_file_path, p_file_url, p_file_hash)
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

-- ---------------------------------------------------------------------
-- B. Stock history
-- ---------------------------------------------------------------------

create table if not exists public.stock_movements (
  id              bigint generated always as identity primary key,
  product_id      bigint not null references public.products(id) on delete cascade,
  product_name    text,
  old_quantity    integer not null,
  new_quantity    integer not null,
  change          integer generated always as (new_quantity - old_quantity) stored,
  reason          text not null,
  changed_by      uuid,
  changed_by_name text,
  created_at      timestamptz not null default now()
);

create index if not exists stock_movements_product_time
  on public.stock_movements (product_id, created_at desc);

-- No policies: nobody reads or writes the table directly. The trigger
-- below writes it; admins read it through list_stock_movements().
alter table public.stock_movements enable row level security;

create or replace function public.log_stock_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_query  text := lower(coalesce(current_query(), ''));
  v_old    integer := case when tg_op = 'INSERT' then 0 else coalesce(old.quantity, 0) end;
  v_reason text;
  v_by     text;
begin
  if tg_op = 'UPDATE' and new.quantity is not distinct from old.quantity then
    return new;
  end if;

  -- What caused it: the app's own functions are recognised by name.
  -- Anything else done with the service key is the receipt scanner (n8n).
  v_reason := case
    when v_query like '%process_sale%'         then 'Sale'
    when v_query like '%add_stock%'            then 'Stock added'
    when v_query like '%set_product_quantity%' then 'Quantity edited'
    when v_query like '%approve_inspection%'   then 'Inspection return'
    when v_query like '%add_product%'          then 'New product'
    when coalesce(auth.role(), '') = 'service_role' then
      case when tg_op = 'INSERT' then 'New product (receipt scanner)' else 'Receipt scanner' end
    when tg_op = 'INSERT' then 'New product'
    else 'Other change'
  end;

  if auth.uid() is not null then
    select coalesce(nullif(trim(full_name), ''), email) into v_by
    from profiles
    where id = auth.uid();
  elsif coalesce(auth.role(), '') = 'service_role' then
    v_by := 'Receipt scanner (n8n)';
  else
    v_by := 'System';
  end if;

  insert into stock_movements (
    product_id, product_name, old_quantity, new_quantity, reason, changed_by, changed_by_name
  )
  values (
    new.id, new.name, v_old, coalesce(new.quantity, 0), v_reason, auth.uid(), v_by
  );

  return new;
end;
$function$;

drop trigger if exists log_stock_movement on public.products;

create trigger log_stock_movement
  after insert or update of quantity on public.products
  for each row execute function public.log_stock_movement();

create or replace function public.list_stock_movements(p_product_id bigint default null, p_limit integer default 200)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc, m.id desc), '[]'::jsonb)
    into v_rows
  from (
    select *
    from stock_movements
    where p_product_id is null or product_id = p_product_id
    order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
  ) m;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- Who can call the new functions
-- ---------------------------------------------------------------------

revoke execute on function public.supplier_submit_upload(text, text, text, text) from public, anon;
revoke execute on function public.list_stock_movements(bigint, integer) from public, anon;
revoke execute on function public.log_stock_movement() from public, anon, authenticated;

grant execute on function
  public.supplier_submit_upload(text, text, text, text),
  public.list_stock_movements(bigint, integer)
to authenticated;

commit;
