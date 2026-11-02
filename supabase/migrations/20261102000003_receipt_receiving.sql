-- =====================================================================
-- Receiving: a receipt that comes before its delivery
-- ---------------------------------------------------------------------
-- A supplier's receipt can be scanned before the goods reach the store.
-- Then, instead of "Confirm & add to stock", the owner presses
-- "Not delivered yet" in Check prices and picks the staff member who will
-- receive it:
--
--   1. owner   admin_start_receiving        prices saved, nothing in stock
--   2. staff   staff_receive_delivery       counts what really arrived
--   3. owner   admin_approve_receiving      adds what arrived, at the prices
--              (or admin_cancel_receiving: back to Check prices)
--
-- Stock is added with the existing admin_confirm_receipt_review, using the
-- RECEIVED quantities; products that didn't arrive at all are rejected
-- with admin_dismiss_receipt_review. So the supplier's confirmation shows
-- what was received.
--
-- Notifications go to a role (all staff / the owner), as in the rest of
-- the system; the delivery itself shows only for the staff member chosen.
-- Staff never see prices or costs.
--
-- Until this is run, Check prices has no "Not delivered yet" (the app hides
-- it when this SQL is missing) and nothing else changes.
-- Safe to run more than once.
-- =====================================================================

begin;

create table if not exists public.receipt_deliveries (
  id               bigserial primary key,
  receipt_ref      text not null,          -- supplier_uploads.id, as receipt_review_items.upload_ref
  file_name        text,
  supplier_name    text,
  assigned_to      uuid not null references auth.users (id),
  assigned_name    text,
  expected_date    date,
  note             text,
  status           text not null default 'waiting'
                   check (status in ('waiting', 'received', 'approved', 'cancelled')),
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  received_by      uuid references auth.users (id) on delete set null,
  received_by_name text,
  received_at      timestamptz,
  receive_note     text,
  reviewed_at      timestamptz
);

-- one open delivery per receipt
create unique index if not exists receipt_deliveries_one_open
  on public.receipt_deliveries (receipt_ref)
  where status in ('waiting', 'received');

create table if not exists public.receipt_delivery_items (
  id             bigserial primary key,
  delivery_id    bigint not null references public.receipt_deliveries (id) on delete cascade,
  review_item_id bigint not null,          -- receipt_review_items.id
  product_id     text,
  product_name   text not null,
  is_new         boolean not null default false,
  expected_qty   integer not null,
  price          numeric not null,          -- the owner's selling price, applied on approval
  received_qty   integer,
  note           text
);

create index if not exists receipt_delivery_items_delivery on public.receipt_delivery_items (delivery_id);

alter table public.receipt_deliveries enable row level security;
alter table public.receipt_delivery_items enable row level security;
revoke all on public.receipt_deliveries from anon, authenticated;
revoke all on public.receipt_delivery_items from anon, authenticated;

-- a deliveries row as JSON, with its items (prices only when p_prices)
create or replace function public.receiving_json(p_delivery public.receipt_deliveries, p_prices boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select to_jsonb(p_delivery) || jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', i.id,
                 'product_name', i.product_name,
                 'is_new', i.is_new,
                 'expected_qty', i.expected_qty,
                 'received_qty', i.received_qty,
                 'note', i.note
               ) || case when p_prices then jsonb_build_object('price', i.price) else '{}'::jsonb end
               order by i.id)
        from public.receipt_delivery_items i
       where i.delivery_id = p_delivery.id
    ), '[]'::jsonb)
  );
$function$;

revoke execute on function public.receiving_json(public.receipt_deliveries, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Owner: "Not delivered yet" -> a staff member receives it
--    p_items: [{ id: <receipt_review_items.id>, price: 123.45 }, ...]
-- ---------------------------------------------------------------------
create or replace function public.admin_start_receiving(
  p_receipt_ref   text,
  p_staff_id      uuid,
  p_expected_date date,
  p_note          text,
  p_items         jsonb
)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_staff     text;
  v_file      text;
  v_supplier  text;
  v_id        bigint;
  v_price     numeric;
  v_count     integer := 0;
  v_pieces    integer := 0;
  r           public.receipt_review_items%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_staff
    from public.profiles
   where id = p_staff_id and role = 'staff' and coalesce(is_active, true);

  if v_staff is null then
    raise exception 'Choose an active staff account to receive it.';
  end if;

  if exists (select 1 from public.receipt_deliveries
              where receipt_ref = p_receipt_ref and status in ('waiting', 'received')) then
    raise exception 'This receipt is already waiting for its delivery.';
  end if;

  select su.file_name,
         coalesce(nullif(to_jsonb(su)->>'supplier_name', ''),
                  (select coalesce(nullif(btrim(p.full_name), ''), p.email) from public.profiles p where p.id = su.supplier_id))
    into v_file, v_supplier
    from public.supplier_uploads su
   where su.id::text = p_receipt_ref;

  insert into public.receipt_deliveries
    (receipt_ref, file_name, supplier_name, assigned_to, assigned_name, expected_date, note)
  values
    (p_receipt_ref, v_file, v_supplier, p_staff_id, v_staff, p_expected_date, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  -- every product of the receipt that is still waiting (not in stock yet)
  for r in
    select * from public.receipt_review_items
     where upload_ref = p_receipt_ref
       and status = 'pending'
       and not stock_applied
       and product_id is not null
     order by id
     for update
  loop
    select nullif(e->>'price', '')::numeric into v_price
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
     where (e->>'id')::bigint = r.id;

    if v_price is null or v_price < 0 then
      raise exception 'Give "%" a price first.', r.product_name;
    end if;
    if r.is_new and v_price <= 0 then
      raise exception 'Give the new product "%" a selling price above ₱0.', r.product_name;
    end if;

    -- the owner's price, kept on the receipt too (Check prices shows it if
    -- the delivery is cancelled)
    update public.receipt_review_items set price = v_price where id = r.id;

    insert into public.receipt_delivery_items
      (delivery_id, review_item_id, product_id, product_name, is_new, expected_qty, price)
    values
      (v_id, r.id, r.product_id, coalesce(r.product_name, 'Product'), coalesce(r.is_new, false),
       greatest(coalesce(r.qty_added, 0), 0)::integer, v_price);

    v_count := v_count + 1;
    v_pieces := v_pieces + greatest(coalesce(r.qty_added, 0), 0)::integer;
  end loop;

  if v_count = 0 then
    raise exception 'Nothing from this receipt is waiting to be received (its stock may already be added).';
  end if;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values (
    'Delivery to receive',
    format('%s will receive %s from %s: %s product%s, %s pcs%s.',
      v_staff, coalesce(v_file, 'a receipt'), coalesce(v_supplier, 'the supplier'),
      v_count, case when v_count = 1 then '' else 's' end, v_pieces,
      case when p_expected_date is null then '' else ', expected ' || to_char(p_expected_date, 'Mon DD') end),
    'receive',
    false,
    'staff'
  );

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Staff: the deliveries I was chosen to receive (no prices)
-- ---------------------------------------------------------------------
create or replace function public.list_my_receivings()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['staff']);

  return coalesce((
    select jsonb_agg(public.receiving_json(d, false) order by d.expected_date nulls last, d.id)
      from public.receipt_deliveries d
     where d.assigned_to = auth.uid()
       and d.status in ('waiting', 'received')
  ), '[]'::jsonb);
end;
$function$;

-- Staff: what arrived. p_items: [{ id, received_qty, note }, ...] for every item.
create or replace function public.staff_receive_delivery(p_delivery_id bigint, p_items jsonb, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d        public.receipt_deliveries%rowtype;
  i        public.receipt_delivery_items%rowtype;
  v_e      jsonb;
  v_qty    integer;
  v_name   text;
  v_short  integer := 0;
  v_count  integer := 0;
begin
  perform public.require_role(array['staff']);

  select * into d from public.receipt_deliveries where id = p_delivery_id for update;

  if not found or d.assigned_to is distinct from auth.uid() then
    raise exception 'This delivery isn''t assigned to you.';
  end if;
  if d.status <> 'waiting' then
    raise exception 'This delivery was already marked as received.';
  end if;

  for i in select * from public.receipt_delivery_items where delivery_id = d.id order by id
  loop
    select e into v_e
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
     where (e->>'id')::bigint = i.id;

    if v_e is null or nullif(v_e->>'received_qty', '') is null then
      raise exception 'Enter how many "%" arrived (0 if none).', i.product_name;
    end if;

    v_qty := (v_e->>'received_qty')::numeric::integer;

    if v_qty < 0 then
      raise exception 'The received number for "%" can''t be below 0.', i.product_name;
    end if;
    if v_qty > i.expected_qty then
      raise exception 'More "%" than on the receipt (%). Count only what the receipt lists, and write the extra in the note.', i.product_name, i.expected_qty;
    end if;

    update public.receipt_delivery_items
       set received_qty = v_qty,
           note = nullif(btrim(coalesce(v_e->>'note', '')), '')
     where id = i.id;

    v_count := v_count + 1;
    if v_qty < i.expected_qty then v_short := v_short + 1; end if;
  end loop;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();

  update public.receipt_deliveries
     set status = 'received',
         received_by = auth.uid(),
         received_by_name = v_name,
         received_at = now(),
         receive_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = d.id;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values (
    'Delivery received',
    format('%s received %s: %s', coalesce(v_name, 'Staff'), coalesce(d.file_name, 'a delivery'),
      case when v_short = 0 then 'everything arrived. Review it to add it to stock.'
           else format('%s of %s products came short. Review it before adding it to stock.', v_short, v_count) end),
    'received',
    false,
    'admin'
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Owner: the open deliveries (with prices), approve or cancel
-- ---------------------------------------------------------------------
create or replace function public.admin_list_receivings()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  return coalesce((
    -- received (waiting for the owner) first
    select jsonb_agg(public.receiving_json(d, true) order by (d.status = 'received') desc, d.id)
      from public.receipt_deliveries d
     where d.status in ('waiting', 'received')
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_approve_receiving(p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d        public.receipt_deliveries%rowtype;
  i        public.receipt_delivery_items%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_none   bigint[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select * into d from public.receipt_deliveries where id = p_delivery_id for update;

  if not found then
    raise exception 'This delivery no longer exists.';
  end if;
  if d.status <> 'received' then
    raise exception 'The staff member hasn''t marked this delivery as received yet.';
  end if;

  for i in select * from public.receipt_delivery_items where delivery_id = d.id order by id
  loop
    if coalesce(i.received_qty, 0) > 0 then
      -- add what arrived, not what the receipt said
      update public.receipt_review_items
         set qty_added = i.received_qty
       where id = i.review_item_id and status = 'pending';

      v_items := v_items || jsonb_build_object('id', i.review_item_id, 'price', i.price);
    else
      v_none := v_none || i.review_item_id;
    end if;
  end loop;

  if jsonb_array_length(v_items) > 0 then
    perform public.admin_confirm_receipt_review(v_items);
  end if;
  if array_length(v_none, 1) > 0 then
    perform public.admin_dismiss_receipt_review(v_none);
  end if;

  update public.receipt_deliveries set status = 'approved', reviewed_at = now() where id = d.id;
end;
$function$;

create or replace function public.admin_cancel_receiving(p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d public.receipt_deliveries%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  update public.receipt_deliveries
     set status = 'cancelled', reviewed_at = now()
   where id = p_delivery_id and status in ('waiting', 'received')
  returning * into d;

  if not found then
    raise exception 'This delivery is already closed.';
  end if;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values ('Delivery cancelled',
          format('The owner cancelled the delivery of %s that %s was to receive.',
                 coalesce(d.file_name, 'a receipt'), coalesce(d.assigned_name, 'staff')),
          'receive', false, 'staff');
end;
$function$;

revoke execute on function public.admin_start_receiving(text, uuid, date, text, jsonb) from public, anon;
revoke execute on function public.list_my_receivings() from public, anon;
revoke execute on function public.staff_receive_delivery(bigint, jsonb, text) from public, anon;
revoke execute on function public.admin_list_receivings() from public, anon;
revoke execute on function public.admin_approve_receiving(bigint) from public, anon;
revoke execute on function public.admin_cancel_receiving(bigint) from public, anon;
grant execute on function public.admin_start_receiving(text, uuid, date, text, jsonb) to authenticated;
grant execute on function public.list_my_receivings() to authenticated;
grant execute on function public.staff_receive_delivery(bigint, jsonb, text) to authenticated;
grant execute on function public.admin_list_receivings() to authenticated;
grant execute on function public.admin_approve_receiving(bigint) to authenticated;
grant execute on function public.admin_cancel_receiving(bigint) to authenticated;

commit;
