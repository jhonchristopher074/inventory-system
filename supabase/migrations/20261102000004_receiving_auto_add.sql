-- =====================================================================
-- Receiving, version 2: received = added to stock, and fixes
-- ---------------------------------------------------------------------
-- Run after 20261102000003_receipt_receiving.sql.
--
-- 1. No second check by the owner. When the staff member presses "Mark
--    as delivered", what arrived goes into stock right away, at the
--    owner's prices; products that didn't arrive at all are rejected. The
--    owner gets the details (what arrived, what came short, the notes) in
--    a notification and under Approval > Deliveries.
--    Deliveries already marked received and waiting for the owner are
--    added to stock when this file is run.
-- 2. The owner can receive a delivery himself (staff member absent), or
--    give it to another staff member (admin_reassign_receiving).
-- 3. Fix: suppliers missed "receipt confirmed" in their bell. The review
--    rows had no decision date, so the scan date was used. Now
--    receipt_review_items.decided_at is filled when a row is decided.
-- 4. Fix: a receipt waiting for its delivery could still be confirmed or
--    rejected from an old Check prices window, adding the stock before the
--    goods came. The database now refuses it.
-- 5. Fix: stock history said "Other change" for received deliveries; now
--    "Delivery received".
-- 6. Fix: new products from a receipt are "name only" (0 stock, ₱0) until
--    confirmed, so the POS showed them as "Out of stock ₱0.00", for days
--    while a delivery is awaited, and for good after a Reject.
--    list_held_product_ids() gives them, and the POS, Inventory and the
--    dashboards leave them out.
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------
alter table public.receipt_review_items
  add column if not exists decided_at timestamptz;

alter table public.receipt_deliveries
  add column if not exists stock_added_at timestamptz,
  add column if not exists added_pieces   integer;

-- one open (waiting) delivery per receipt: "received" is finished now
drop index if exists public.receipt_deliveries_one_open;
create unique index if not exists receipt_deliveries_one_waiting
  on public.receipt_deliveries (receipt_ref)
  where status = 'waiting';

-- deliveries the owner approved with version 1: their stock is in already
update public.receipt_deliveries
   set status = 'received',
       stock_added_at = coalesce(stock_added_at, reviewed_at, received_at, now())
 where status = 'approved';

-- ---------------------------------------------------------------------
-- 3 + 4. receipt_review_items: the decision's date, and no deciding a
--        receipt that waits for its delivery (except by receiving it)
-- ---------------------------------------------------------------------
create or replace function public.receipt_review_items_guard()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.status = 'pending' and new.status is distinct from 'pending' then
    if coalesce(current_setting('app.receiving', true), '') <> 'on' and exists (
      select 1
        from public.receipt_delivery_items di
        join public.receipt_deliveries d on d.id = di.delivery_id
       where di.review_item_id = old.id
         and d.status = 'waiting'
    ) then
      raise exception 'This receipt is waiting for its delivery: its stock is added when it''s received. Reload the page.';
    end if;

    new.decided_at := coalesce(new.decided_at, now());
  end if;

  return new;
end;
$function$;

drop trigger if exists receipt_review_items_guard on public.receipt_review_items;
create trigger receipt_review_items_guard
  before update on public.receipt_review_items
  for each row execute function public.receipt_review_items_guard();

-- ---------------------------------------------------------------------
-- 1. Adding a received delivery to stock (internal: called by the
--    functions below, never by the app directly)
-- ---------------------------------------------------------------------
create or replace function public.receiving_apply(p_delivery_id bigint)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  i        public.receipt_delivery_items%rowtype;
  r        public.receipt_review_items%rowtype;
  v_pieces integer := 0;
begin
  -- lets the guard above through: this is the delivery being received
  perform set_config('app.receiving', 'on', true);

  for i in select * from public.receipt_delivery_items where delivery_id = p_delivery_id order by id
  loop
    -- (stock_applied rows never join a delivery: their stock is in already)
    select * into r
      from public.receipt_review_items
     where id = i.review_item_id and status = 'pending' and not stock_applied
     for update;

    if not found then
      continue; -- already decided: nothing is added twice
    end if;

    if coalesce(i.received_qty, 0) > 0 and r.product_id is not null then
      update public.products
         set price = i.price,
             quantity = coalesce(quantity, 0) + i.received_qty
       where id::text = r.product_id;

      if not found then
        raise exception 'The product "%" no longer exists.', r.product_name;
      end if;

      update public.receipt_review_items
         set status = 'done',
             price = i.price,
             qty_added = i.received_qty,
             stock_applied = true,
             decision = 'approved',
             decided_at = now()
       where id = r.id;

      v_pieces := v_pieces + i.received_qty;
    else
      -- nothing of it arrived
      update public.receipt_review_items
         set status = 'done',
             decision = 'rejected',
             decided_at = now()
       where id = r.id;
    end if;
  end loop;

  update public.receipt_deliveries
     set stock_added_at = now(),
         added_pieces = v_pieces
   where id = p_delivery_id;

  perform set_config('app.receiving', '', true);
  return v_pieces;
end;
$function$;

revoke execute on function public.receiving_apply(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1 + 2. Staff (or the owner): what arrived -> straight into stock.
--        p_items: [{ id, received_qty, note }, ...] for every item.
-- ---------------------------------------------------------------------
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
  v_short  text[] := '{}';
  v_count  integer := 0;
  v_got    integer := 0;
  v_want   integer := 0;
begin
  perform public.require_role(array['staff', 'admin']);

  select * into d from public.receipt_deliveries where id = p_delivery_id for update;

  -- the staff member chosen, or the owner (e.g. that staff member is away)
  if not found or (d.assigned_to is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'This delivery isn''t assigned to you.';
  end if;
  if d.status <> 'waiting' then
    raise exception 'This delivery was already received.';
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
    v_got := v_got + v_qty;
    v_want := v_want + i.expected_qty;
    if v_qty < i.expected_qty then
      v_short := v_short || format('%s (%s of %s%s)', i.product_name, v_qty, i.expected_qty,
        coalesce(', ' || nullif(btrim(coalesce(v_e->>'note', '')), ''), ''));
    end if;
  end loop;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();

  update public.receipt_deliveries
     set status = 'received',
         received_by = auth.uid(),
         received_by_name = v_name,
         received_at = now(),
         receive_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = d.id;

  -- what arrived goes into stock now
  perform public.receiving_apply(d.id);

  -- the details, for the owner (not when he received it himself)
  if not public.is_admin() then
    insert into public.notifications (title, message, type, is_read, recipient_role)
    values (
      'Delivery received',
      format('%s received %s: %s of %s pcs added to stock.%s%s',
        coalesce(v_name, 'Staff'), coalesce(d.file_name, 'a delivery'), v_got, v_want,
        case when cardinality(v_short) = 0 then ' Everything arrived.'
             else ' Short: ' || array_to_string(v_short[1:3], '; ')
                  || case when cardinality(v_short) > 3 then format(' and %s more', cardinality(v_short) - 3) else '' end
                  || '.' end,
        coalesce(' Note: ' || nullif(btrim(coalesce(p_note, '')), ''), '')),
      'received',
      false,
      'admin'
    );
  end if;
end;
$function$;

-- version 1's approval step: no longer used by the app; kept so an old
-- open page doesn't break. Adds the stock if it wasn't added yet.
create or replace function public.admin_approve_receiving(p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  if exists (select 1 from public.receipt_deliveries
              where id = p_delivery_id and status = 'received' and stock_added_at is null) then
    perform public.receiving_apply(p_delivery_id);
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Give a waiting delivery to another staff member
-- ---------------------------------------------------------------------
create or replace function public.admin_reassign_receiving(p_delivery_id bigint, p_staff_id uuid, p_expected_date date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_staff text;
  d       public.receipt_deliveries%rowtype;
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

  update public.receipt_deliveries
     set assigned_to = p_staff_id,
         assigned_name = v_staff,
         expected_date = coalesce(p_expected_date, expected_date)
   where id = p_delivery_id and status = 'waiting'
  returning * into d;

  if not found then
    raise exception 'This delivery was already received or cancelled.';
  end if;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values ('Delivery to receive',
          format('%s will receive %s now%s.', v_staff, coalesce(d.file_name, 'a delivery'),
            case when d.expected_date is null then '' else ', expected ' || to_char(d.expected_date, 'Mon DD') end),
          'receive', false, 'staff');
end;
$function$;

-- ---------------------------------------------------------------------
-- The lists: waiting ones, and the received ones of the last days
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
    select jsonb_agg(public.receiving_json(d, true)
                     order by (d.status = 'waiting') desc,
                              case when d.status = 'waiting' then d.expected_date end nulls last,
                              d.received_at desc nulls last, d.id)
      from public.receipt_deliveries d
     where d.status = 'waiting'
        or (d.status = 'received' and d.received_at > now() - interval '14 days')
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.list_my_receivings()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['staff']);

  return coalesce((
    select jsonb_agg(public.receiving_json(d, false)
                     order by (d.status = 'waiting') desc,
                              case when d.status = 'waiting' then d.expected_date end nulls last,
                              d.received_at desc nulls last, d.id)
      from public.receipt_deliveries d
     where d.assigned_to = auth.uid()
       and (d.status = 'waiting'
            or (d.status = 'received' and d.received_at > now() - interval '3 days'))
  ), '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. Products that exist by name only (new from a receipt, not confirmed
--    or received yet): the POS, Inventory and dashboards leave them out
-- ---------------------------------------------------------------------
create or replace function public.list_held_product_ids()
 returns table (product_id text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin', 'cashier', 'staff']);

  return query
    select distinct i.product_id
      from public.receipt_review_items i
     where i.is_new
       and i.product_id is not null
       and (
         -- waiting: for Confirm, or for its delivery
         (i.status = 'pending' and not i.stock_applied)
         -- rejected, or none of it arrived: the store never had it (until
         -- a later receipt stocks and prices it)
         or (i.decision = 'rejected' and exists (
               select 1 from public.products p
                where p.id::text = i.product_id
                  and coalesce(p.quantity, 0) = 0
                  and coalesce(p.price, 0) = 0))
       );
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. Stock history: "Delivery received" (the rest as it was)
-- ---------------------------------------------------------------------
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

  v_reason := case
    when v_query like '%staff_receive_delivery%' or v_query like '%receiving_apply%'
      or v_query like '%admin_approve_receiving%' then 'Delivery received'
    when v_query like '%admin_confirm_receipt_review%' then 'Receipt approved'
    when v_query like '%process_sale%'         then 'Sale'
    when v_query like '%add_stock%'            then 'Stock added'
    when v_query like '%set_product_quantity%' then 'Quantity edited'
    when v_query like '%approve_inspection%'   then 'Inspection return'
    when v_query like '%add_product%'          then 'New product'
    when coalesce(auth.role(), '') = 'service_role' then
      case when tg_op = 'INSERT' then 'New product (receipt, waiting for approval)' else 'Receipt scanner' end
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

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.staff_receive_delivery(bigint, jsonb, text) from public, anon;
revoke execute on function public.admin_approve_receiving(bigint) from public, anon;
revoke execute on function public.admin_reassign_receiving(bigint, uuid, date) from public, anon;
revoke execute on function public.admin_list_receivings() from public, anon;
revoke execute on function public.list_my_receivings() from public, anon;
revoke execute on function public.list_held_product_ids() from public, anon;
grant execute on function public.staff_receive_delivery(bigint, jsonb, text) to authenticated;
grant execute on function public.admin_approve_receiving(bigint) to authenticated;
grant execute on function public.admin_reassign_receiving(bigint, uuid, date) to authenticated;
grant execute on function public.admin_list_receivings() to authenticated;
grant execute on function public.list_my_receivings() to authenticated;
grant execute on function public.list_held_product_ids() to authenticated;

-- ---------------------------------------------------------------------
-- Deliveries already received and waiting for the owner (version 1):
-- added to stock now, as the new rule says
-- ---------------------------------------------------------------------
do $$
declare
  v_id bigint;
begin
  for v_id in
    select id from public.receipt_deliveries
     where status = 'received' and stock_added_at is null
  loop
    perform public.receiving_apply(v_id);
  end loop;
end;
$$;

commit;

-- check: open and recent deliveries, and what was added
select id, file_name, assigned_name, status, received_at, stock_added_at, added_pieces
  from public.receipt_deliveries
 order by id desc
 limit 10;
