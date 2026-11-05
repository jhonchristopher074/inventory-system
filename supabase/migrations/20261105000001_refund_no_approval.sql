-- =====================================================================
-- Refunds without the owner's approval
-- ---------------------------------------------------------------------
-- Run after 20261104000003_refund_documents.sql.
-- The cashier (or the owner) refunds at the POS and it's done at once:
-- the sale goes down, the pieces go back into stock ("Refund" in stock
-- history), and the owner gets the details in the bell. Every refund is
-- kept in Approval > Refunds (7 days) and Documentation > Refunded.
--   pos_refund(sale, items, note)  the refund (cashier or owner)
--   refund_apply(request, by)      internal: takes it off the sale and
--                                  puts the pieces back
-- Requests still waiting from before are refunded when this file is run
-- (a request that can no longer be refunded stays for the owner).
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.refund_apply(p_request_id bigint, p_by text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r       public.refund_requests%rowtype;
  ri      public.refund_request_items%rowtype;
  v_item  public.sale_items%rowtype;
  v_pcs   integer := 0;
begin
  select * into r from public.refund_requests where id = p_request_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'This refund was already done.';
  end if;

  for ri in select * from public.refund_request_items where request_id = r.id order by id
  loop
    select * into v_item from public.sale_items where id = ri.sale_item_id for update;

    if not found or v_item.quantity < ri.quantity then
      raise exception 'Sale #% has only % "%" left to refund.',
        r.sale_id, coalesce(v_item.quantity, 0), ri.product_name;
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

  update public.refund_requests
     set status = 'approved',
         decided_by_name = p_by,
         decided_at = now()
   where id = r.id;

  return v_pcs;
end;
$function$;

revoke execute on function public.refund_apply(bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- The refund, at the POS (cashier: their own sales; owner: anyone's).
-- Only today's sales. p_items: [{ sale_item_id, quantity }, ...]
-- ---------------------------------------------------------------------
create or replace function public.pos_refund(p_sale_id bigint, p_items jsonb, p_note text)
 returns jsonb
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
  v_pcs      integer;
begin
  perform public.require_role(array['cashier', 'admin']);

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Sale #% was not found.', p_sale_id;
  end if;
  if v_sale.cashier_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Sale #% was made by another cashier: the owner can refund it.', p_sale_id;
  end if;

  -- only today's sales (the store's day, Philippine time)
  if (v_sale.created_at at time zone 'Asia/Manila')::date <> (now() at time zone 'Asia/Manila')::date then
    raise exception 'Only today''s sales can be refunded. Sale #% was on %.',
      p_sale_id, to_char(v_sale.created_at at time zone 'Asia/Manila', 'Mon DD');
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

  -- done at once: off the sale, back into stock
  v_pcs := public.refund_apply(v_id, v_name);

  -- the owner gets the details (not when he did it himself)
  if not public.is_admin() then
    insert into public.notifications (title, message, type, is_read, recipient_role)
    values (
      'Refund',
      format('%s refunded ₱%s from sale #%s: %s. %s pcs back in stock.%s',
        coalesce(v_name, 'A cashier'), to_char(v_amount, 'FM999,999,990.00'), p_sale_id,
        array_to_string(v_lines[1:3], ', ')
          || case when cardinality(v_lines) > 3 then format(' and %s more', cardinality(v_lines) - 3) else '' end,
        v_pcs,
        coalesce(' Why: ' || nullif(btrim(coalesce(p_note, '')), ''), '')),
      'refund', false, 'admin');
  end if;

  return jsonb_build_object('id', v_id, 'amount', v_amount, 'pieces', v_pcs);
end;
$function$;

revoke execute on function public.pos_refund(bigint, jsonb, text) from public, anon;
grant execute on function public.pos_refund(bigint, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------
-- Stock history: "Refund" for pos_refund too (the rest as before)
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
    when v_query like '%admin_decide_refund%' or v_query like '%pos_refund%' then 'Refund'
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
-- Requests still waiting from before: refunded now
-- ---------------------------------------------------------------------
do $$
declare
  v_r record;
begin
  for v_r in select id, requested_by_name from public.refund_requests where status = 'pending' order by id
  loop
    begin
      perform public.refund_apply(v_r.id, v_r.requested_by_name);
    exception when others then
      raise notice 'Refund request % stays for the owner: %', v_r.id, sqlerrm;
    end;
  end loop;
end;
$$;

commit;

-- check: the latest refunds
select id, sale_id, amount, status, requested_by_name, decided_at
  from public.refund_requests
 order by id desc
 limit 10;
