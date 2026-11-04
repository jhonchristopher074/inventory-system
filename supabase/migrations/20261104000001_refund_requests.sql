-- =====================================================================
-- Refunds: the cashier asks, the owner approves
-- ---------------------------------------------------------------------
-- A customer brings back a product. The cashier (POS > Refund, or Sales
-- History > a sale > Request refund) picks the sale, how many of each
-- product came back, and may add a note why. The owner gets it in the
-- bell and under Approval > Refunds:
--   Approve  the sale's quantities, subtotals and total go down (so the
--            sales history and reports drop it), and the pieces go back
--            into stock. Stock history says "Refund".
--   Reject   nothing changes (an optional reason goes to the cashier).
--
-- Tables: refund_requests (one per request) and refund_request_items.
-- sale_items.refunded_qty and sales.refunded_amount keep what was
-- refunded, for the receipts.
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables (no policies: only the functions below read and write them)
-- ---------------------------------------------------------------------
create table if not exists public.refund_requests (
  id                bigint generated always as identity primary key,
  sale_id           bigint not null,
  note              text,
  amount            numeric not null default 0,
  status            text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  requested_by      uuid,
  requested_by_name text,
  created_at        timestamptz not null default now(),
  decided_by_name   text,
  decided_at        timestamptz,
  reject_reason     text
);

create table if not exists public.refund_request_items (
  id            bigint generated always as identity primary key,
  request_id    bigint not null references public.refund_requests(id) on delete cascade,
  sale_item_id  bigint not null,
  product_id    bigint,
  product_name  text,
  quantity      integer not null check (quantity > 0),
  price         numeric not null,
  amount        numeric not null
);

create index if not exists refund_requests_status on public.refund_requests (status, created_at desc);
create index if not exists refund_requests_sale on public.refund_requests (sale_id);
create index if not exists refund_request_items_request on public.refund_request_items (request_id);
create index if not exists refund_request_items_sale_item on public.refund_request_items (sale_item_id);

alter table public.refund_requests enable row level security;
alter table public.refund_request_items enable row level security;

-- what was refunded, kept on the sale (the receipts show it)
alter table public.sale_items add column if not exists refunded_qty integer not null default 0;
alter table public.sales add column if not exists refunded_amount numeric not null default 0;

-- ---------------------------------------------------------------------
-- One request as JSON, with its products and the sale's date / cashier
-- ---------------------------------------------------------------------
create or replace function public.refund_json(p_request public.refund_requests)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select to_jsonb(p_request) || jsonb_build_object(
    'sale_created_at', s.created_at,
    'sale_cashier_name', s.cashier_name,
    'sale_total', s.total_amount,
    'items', coalesce((
      select jsonb_agg(to_jsonb(ri) order by ri.id)
        from public.refund_request_items ri
       where ri.request_id = p_request.id
    ), '[]'::jsonb)
  )
  from (select 1) one
  left join public.sales s on s.id = p_request.sale_id;
$function$;

revoke execute on function public.refund_json(public.refund_requests) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Cashier: ask for a refund.
--   p_items: [{ sale_item_id, quantity }, ...] (0 = not refunded)
-- ---------------------------------------------------------------------
create or replace function public.cashier_request_refund(p_sale_id bigint, p_items jsonb, p_note text)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sale     public.sales%rowtype;
  v_e        jsonb;
  v_item     public.sale_items%rowtype;
  v_qty      integer;
  v_pending  integer;
  v_id       bigint;
  v_name     text;
  v_amount   numeric := 0;
  v_lines    text[] := '{}';
  v_rows     jsonb := '[]'::jsonb;
begin
  perform public.require_role(array['cashier', 'admin']);

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Sale #% was not found.', p_sale_id;
  end if;
  if v_sale.cashier_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Sale #% was made by another cashier: they ask for its refund.', p_sale_id;
  end if;

  for v_e in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := coalesce(nullif(v_e->>'quantity', '')::numeric::integer, 0);
    continue when v_qty = 0;

    if v_qty < 0 then
      raise exception 'A refund quantity can''t be below 0.';
    end if;

    select * into v_item
      from public.sale_items
     where id = (v_e->>'sale_item_id')::bigint and sale_id = p_sale_id
     for update;

    if not found then
      raise exception 'That product isn''t part of sale #%.', p_sale_id;
    end if;

    -- already asked for, not decided yet
    select coalesce(sum(ri.quantity), 0) into v_pending
      from public.refund_request_items ri
      join public.refund_requests r on r.id = ri.request_id
     where ri.sale_item_id = v_item.id and r.status = 'pending';

    if v_qty > v_item.quantity - v_pending then
      raise exception 'Only % "%" can still be refunded from sale #%.',
        greatest(v_item.quantity - v_pending, 0), v_item.product_name, p_sale_id;
    end if;

    v_rows := v_rows || jsonb_build_object(
      'sale_item_id', v_item.id,
      'product_id', v_item.product_id,
      'product_name', v_item.product_name,
      'quantity', v_qty,
      'price', v_item.price,
      'amount', v_item.price * v_qty);
    v_amount := v_amount + v_item.price * v_qty;
    v_lines := v_lines || format('%s × %s', v_qty, v_item.product_name);
  end loop;

  if jsonb_array_length(v_rows) = 0 then
    raise exception 'Choose at least one product to refund.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();

  insert into public.refund_requests (sale_id, note, amount, requested_by, requested_by_name)
  values (p_sale_id, nullif(btrim(coalesce(p_note, '')), ''), v_amount, auth.uid(), v_name)
  returning id into v_id;

  insert into public.refund_request_items (request_id, sale_item_id, product_id, product_name, quantity, price, amount)
  select v_id, (e->>'sale_item_id')::bigint, (e->>'product_id')::bigint, e->>'product_name',
         (e->>'quantity')::integer, (e->>'price')::numeric, (e->>'amount')::numeric
    from jsonb_array_elements(v_rows) e;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values (
    'Refund request',
    format('%s asks to refund ₱%s from sale #%s: %s.%s',
      coalesce(v_name, 'A cashier'), to_char(v_amount, 'FM999,999,990.00'), p_sale_id,
      array_to_string(v_lines[1:3], ', ')
        || case when cardinality(v_lines) > 3 then format(' and %s more', cardinality(v_lines) - 3) else '' end,
      coalesce(' Note: ' || nullif(btrim(coalesce(p_note, '')), ''), '')),
    'refund', false, 'admin');

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- Owner: approve (sale goes down, stock goes back up) or reject
-- ---------------------------------------------------------------------
create or replace function public.admin_decide_refund(p_request_id bigint, p_approve boolean, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r       public.refund_requests%rowtype;
  ri      public.refund_request_items%rowtype;
  v_item  public.sale_items%rowtype;
  v_name  text;
  v_pcs   integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select * into r from public.refund_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'This refund request was already decided. Reload the page.';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from public.profiles where id = auth.uid();

  if p_approve then
    for ri in select * from public.refund_request_items where request_id = r.id order by id
    loop
      select * into v_item from public.sale_items where id = ri.sale_item_id for update;

      if not found then
        raise exception '"%" is no longer in sale #%. Reject this request.', ri.product_name, r.sale_id;
      end if;
      if v_item.quantity < ri.quantity then
        raise exception 'Sale #% has only % "%" left to refund. Reject this request.',
          r.sale_id, v_item.quantity, ri.product_name;
      end if;

      -- the sale: fewer sold
      update public.sale_items
         set quantity = quantity - ri.quantity,
             subtotal = greatest(coalesce(subtotal, 0) - ri.amount, 0),
             refunded_qty = refunded_qty + ri.quantity
       where id = v_item.id;

      -- the stock: back on the shelf
      if ri.product_id is not null then
        update public.products
           set quantity = coalesce(quantity, 0) + ri.quantity
         where id = ri.product_id;
      end if;

      v_pcs := v_pcs + ri.quantity;
    end loop;

    update public.sales
       set total_amount = greatest(coalesce(total_amount, 0) - r.amount, 0),
           refunded_amount = refunded_amount + r.amount
     where id = r.sale_id;
  end if;

  update public.refund_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by_name = v_name,
         decided_at = now(),
         reject_reason = case when p_approve then null else nullif(btrim(coalesce(p_reason, '')), '') end
   where id = r.id;

  insert into public.notifications (title, message, type, is_read, recipient_role)
  values (
    case when p_approve then 'Refund approved' else 'Refund rejected' end,
    case when p_approve
      then format('Refund of ₱%s from sale #%s (asked by %s) is approved: %s pcs back in stock. Give the customer the money.',
             to_char(r.amount, 'FM999,999,990.00'), r.sale_id, coalesce(r.requested_by_name, 'a cashier'), v_pcs)
      else format('Refund of ₱%s from sale #%s (asked by %s) was rejected.%s',
             to_char(r.amount, 'FM999,999,990.00'), r.sale_id, coalesce(r.requested_by_name, 'a cashier'),
             coalesce(' Reason: ' || nullif(btrim(coalesce(p_reason, '')), ''), ''))
    end,
    'refund', false, 'cashier');
end;
$function$;

-- ---------------------------------------------------------------------
-- The lists
-- ---------------------------------------------------------------------
-- owner: waiting ones, then the ones decided in the last 14 days
create or replace function public.admin_list_refunds()
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
    select jsonb_agg(public.refund_json(r)
                     order by (r.status = 'pending') desc,
                              case when r.status = 'pending' then r.created_at end,
                              r.decided_at desc nulls last, r.id)
      from public.refund_requests r
     where r.status = 'pending' or r.decided_at > now() - interval '14 days'
  ), '[]'::jsonb);
end;
$function$;

-- cashier: their own requests of the last 30 days
create or replace function public.list_my_refunds()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['cashier', 'admin']);

  return coalesce((
    select jsonb_agg(public.refund_json(r) order by r.created_at desc)
      from public.refund_requests r
     where r.requested_by = auth.uid()
       and (r.status = 'pending' or r.created_at > now() - interval '30 days')
  ), '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------
-- Stock history: "Refund" (the rest as in 20261102000004)
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
    when v_query like '%admin_decide_refund%' then 'Refund'
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
revoke execute on function public.cashier_request_refund(bigint, jsonb, text) from public, anon;
revoke execute on function public.admin_decide_refund(bigint, boolean, text) from public, anon;
revoke execute on function public.admin_list_refunds() from public, anon;
revoke execute on function public.list_my_refunds() from public, anon;
grant execute on function public.cashier_request_refund(bigint, jsonb, text) to authenticated;
grant execute on function public.admin_decide_refund(bigint, boolean, text) to authenticated;
grant execute on function public.admin_list_refunds() to authenticated;
grant execute on function public.list_my_refunds() to authenticated;

commit;

-- check: the new tables (both empty at first)
select (select count(*) from public.refund_requests) as refund_requests,
       (select count(*) from public.refund_request_items) as refund_request_items;
