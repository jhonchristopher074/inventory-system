-- =====================================================================
-- Refunds in Documentation
-- ---------------------------------------------------------------------
-- Run after 20261104000001_refund_requests.sql.
-- Approval > Refunds keeps only the last days; Documentation > Refunded
-- lists every approved refund, for good (the record of money given back).
-- Also: the owner can refund from his own POS at once (no request to
-- himself), so a refund he asks for doesn't notify him.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.admin_list_refund_documents()
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
    select jsonb_agg(public.refund_json(r) order by r.decided_at desc nulls last, r.id desc)
      from public.refund_requests r
     where r.status = 'approved'
  ), '[]'::jsonb);
end;
$function$;

revoke execute on function public.admin_list_refund_documents() from public, anon;
grant execute on function public.admin_list_refund_documents() to authenticated;

-- the owner's own refunds: no "Refund request" in his bell (the rest as
-- in 20261104000002_refund_today_only.sql)
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

  -- the owner refunding it himself (his POS) doesn't notify himself
  if not public.is_admin() then
  insert into public.notifications (title, message, type, is_read, recipient_role)
  values (
    'Refund request',
    format('%s asks to refund ₱%s from sale #%s: %s.%s',
      coalesce(v_name, 'A cashier'), to_char(v_amount, 'FM999,999,990.00'), p_sale_id,
      array_to_string(v_lines[1:3], ', ')
        || case when cardinality(v_lines) > 3 then format(' and %s more', cardinality(v_lines) - 3) else '' end,
      coalesce(' Note: ' || nullif(btrim(coalesce(p_note, '')), ''), '')),
    'refund', false, 'admin');
  end if;

  return v_id;
end;
$function$;
