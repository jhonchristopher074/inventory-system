-- =====================================================================
-- Order requests to suppliers (the panel's "Reordering" revision).
--
-- The Owner or Manager sends an order (Inventory > Low stock > Reorder):
--   requested  the supplier sees it in the Drop Box (Orders) and gets an
--              email (Edge Function send-order-email, through Resend)
--   accepted   the supplier gave a delivery date: it's on the Calendar
--              as a delivery (staff receive it as usual)
--   declined   the supplier said no, with a reason
--   cancelled  the Owner or Manager took it back while still requested
--   completed  the Owner or Manager closed it once the goods were in
--
-- purchase_orders.status stays the EMAIL's state (to_send, sent, failed,
-- cancelled), as before; order_status is the order's own state.
--
-- The n8n webhook on new orders is removed: the n8n trial stops every 14
-- days, and the email now goes through Resend (no double email).
-- Safe to run more than once.
-- =====================================================================

begin;

-- the old n8n webhook ("send-supplier-order") on new orders
drop trigger if exists "trigger" on public.purchase_orders;

alter table public.purchase_orders
  add column if not exists order_status text not null default 'requested',
  add column if not exists expected_date date,
  add column if not exists supplier_reply text,
  add column if not exists responded_at timestamptz,
  add column if not exists delivery_id bigint,
  add column if not exists closed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchase_orders_order_status_check') then
    alter table public.purchase_orders
      add constraint purchase_orders_order_status_check
      check (order_status in ('requested', 'accepted', 'declined', 'cancelled', 'completed'));
  end if;
end $$;


-- ---------------------------------------------------------------------
-- Owner / Manager: send an order (the email follows from the app)
-- ---------------------------------------------------------------------
create or replace function public.admin_create_purchase_order(p_supplier_id uuid, p_items jsonb, p_note text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s       profiles%rowtype;
  v_order purchase_orders%rowtype;
  v_e     jsonb;
  v_qty   numeric;
  p       products%rowtype;
  v_name  text;
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  select * into s from profiles where id = p_supplier_id and role = 'supplier' and coalesce(is_active, true);
  if not found then
    raise exception 'That supplier account was not found.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick at least one product to order.';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'The note is too long (500 characters at most).';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = auth.uid();

  insert into purchase_orders (supplier_id, supplier_name, supplier_email, note, created_by, created_by_name, status, order_status)
  values (s.id, coalesce(nullif(btrim(s.full_name), ''), s.email), coalesce(btrim(s.email), ''), v_note,
          auth.uid(), v_name, 'to_send', 'requested')
  returning * into v_order;

  for v_e in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_qty := (v_e->>'qty')::numeric;
    exception when others then
      raise exception 'Every quantity must be a whole number above 0.';
    end;
    if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) or v_qty > 1000000 then
      raise exception 'Every quantity must be a whole number above 0.';
    end if;

    select * into p from products where id = (v_e->>'product_id')::bigint;
    if not found then
      raise exception 'A product of this order no longer exists. Reload the page.';
    end if;

    insert into purchase_order_items (order_id, product_id, product_name, qty, stock_then)
    values (v_order.id, p.id, p.name, v_qty::integer, coalesce(p.quantity, 0));
  end loop;

  return to_jsonb(v_order);
end;
$function$;


-- every order, newest first, with its products
create or replace function public.admin_list_purchase_orders()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'product_id', i.product_id, 'product_name', i.product_name,
                        'qty', i.qty, 'stock_then', i.stock_then) order by i.id)
                 from purchase_order_items i where i.order_id = o.id), '[]'::jsonb))
           order by o.created_at desc)
      from purchase_orders o
  ), '[]'::jsonb);
end;
$function$;


-- take an order back while the supplier hasn't answered
create or replace function public.admin_cancel_purchase_order(p_order_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  update purchase_orders
     set order_status = 'cancelled', closed_at = now(),
         status = case when status in ('to_send', 'failed') then 'cancelled' else status end
   where id = p_order_id and order_status = 'requested';
  if not found then
    raise exception 'Only an order the supplier hasn''t answered yet can be cancelled.';
  end if;
end;
$function$;


-- the goods are in: close the order
create or replace function public.admin_complete_purchase_order(p_order_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  update purchase_orders set order_status = 'completed', closed_at = now()
   where id = p_order_id and order_status = 'accepted';
  if not found then
    raise exception 'Only an accepted order can be marked as completed.';
  end if;
end;
$function$;


-- the email failed: let the app send it again
create or replace function public.admin_retry_purchase_order(p_order_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  update purchase_orders set status = 'to_send', error = null
   where id = p_order_id and status = 'failed' and order_status = 'requested';
  if not found then
    raise exception 'Only an order whose email failed can be sent again.';
  end if;
end;
$function$;


-- the Reorder window: low products by supplier, and an order still open
create or replace function public.admin_reorder_candidates(p_low integer default 10)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or manager can do this.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'name', p.name,
               'category', p.category,
               'quantity', coalesce(p.quantity, 0),
               'supplier_id', s.id,
               'supplier_name', coalesce(nullif(btrim(s.full_name), ''), s.email),
               'supplier_email', s.email,
               -- already in an order that is waiting or on its way
               'last_order', (
                 select jsonb_build_object('status', o.order_status, 'at', o.created_at, 'qty', oi.qty,
                                           'expected_date', o.expected_date)
                   from purchase_order_items oi
                   join purchase_orders o on o.id = oi.order_id
                  where oi.product_id = p.id
                    and o.order_status in ('requested', 'accepted')
                  order by o.created_at desc
                  limit 1))
             order by coalesce(p.quantity, 0), p.name)
        from products p
        left join profiles s on s.id = p.supplier_id
       where not coalesce(p.is_archived, false)
         and coalesce(p.quantity, 0) <= coalesce(p_low, 10)
         -- new products still waiting on their receipt aren't real yet
         and not exists (select 1 from receipt_review_items i
                          where i.is_new and i.status = 'pending' and i.product_id = p.id::text)
    ), '[]'::jsonb),
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'name', coalesce(nullif(btrim(s.full_name), ''), s.email),
               'email', s.email)
             order by coalesce(nullif(btrim(s.full_name), ''), s.email))
        from profiles s
       where s.role = 'supplier' and coalesce(s.is_active, true)
    ), '[]'::jsonb));
end;
$function$;


-- ---------------------------------------------------------------------
-- Supplier: their own orders, and the answer
-- ---------------------------------------------------------------------
create or replace function public.supplier_list_my_orders()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['supplier']);

  -- no stock or prices: only what to deliver
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id,
             'created_at', o.created_at,
             'ordered_by', o.created_by_name,
             'note', o.note,
             'order_status', o.order_status,
             'expected_date', o.expected_date,
             'supplier_reply', o.supplier_reply,
             'responded_at', o.responded_at,
             'items', coalesce((
               select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'qty', i.qty) order by i.id)
                 from purchase_order_items i where i.order_id = o.id), '[]'::jsonb))
           order by o.created_at desc)
      from purchase_orders o
     where o.supplier_id = auth.uid()
  ), '[]'::jsonb);
end;
$function$;


create or replace function public.supplier_respond_order(p_order_id bigint, p_accept boolean, p_date date default null, p_reply text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o        purchase_orders%rowtype;
  v_reply  text := nullif(btrim(coalesce(p_reply, '')), '');
  v_today  date := (now() at time zone 'Asia/Manila')::date;
  v_pieces integer;
  v_delivery bigint;
begin
  perform public.require_role(array['supplier']);

  select * into o from purchase_orders where id = p_order_id and supplier_id = auth.uid() for update;
  if not found then
    raise exception 'This order was not found.';
  end if;
  if o.order_status <> 'requested' then
    raise exception 'This order was already answered or cancelled.';
  end if;
  if length(coalesce(v_reply, '')) > 300 then
    raise exception 'The message is too long (300 characters at most).';
  end if;

  if p_accept then
    if p_date is null or p_date < v_today then
      raise exception 'Pick the delivery date (today or later).';
    end if;

    select coalesce(sum(qty), 0) into v_pieces from purchase_order_items where order_id = o.id;

    -- on the Calendar as a delivery, for staff to receive
    insert into deliveries (title, supplier, delivery_date, status)
    values (format('Order #%s · %s pcs', o.id, v_pieces), o.supplier_name, p_date, 'Scheduled')
    returning id into v_delivery;

    update purchase_orders
       set order_status = 'accepted', expected_date = p_date, supplier_reply = v_reply,
           responded_at = now(), delivery_id = v_delivery
     where id = o.id;

    insert into notifications (title, message, type, is_read, recipient_role)
    values ('Order accepted',
            format('%s accepted order #%s and will deliver on %s.%s', o.supplier_name, o.id,
                   to_char(p_date, 'Mon DD'), coalesce(' Note: ' || v_reply, '')),
            'purchase_order', false, 'admin');
  else
    if v_reply is null then
      raise exception 'Say why the order is declined.';
    end if;

    update purchase_orders
       set order_status = 'declined', supplier_reply = v_reply, responded_at = now(), closed_at = now()
     where id = o.id;

    insert into notifications (title, message, type, is_read, recipient_role)
    values ('Order declined', format('%s declined order #%s: %s', o.supplier_name, o.id, v_reply),
            'purchase_order', false, 'admin');
  end if;
end;
$function$;


revoke all on function public.admin_create_purchase_order(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.admin_create_purchase_order(uuid, jsonb, text) to authenticated, service_role;
revoke all on function public.admin_list_purchase_orders() from public, anon, authenticated;
grant execute on function public.admin_list_purchase_orders() to authenticated, service_role;
revoke all on function public.admin_cancel_purchase_order(bigint) from public, anon, authenticated;
grant execute on function public.admin_cancel_purchase_order(bigint) to authenticated, service_role;
revoke all on function public.admin_complete_purchase_order(bigint) from public, anon, authenticated;
grant execute on function public.admin_complete_purchase_order(bigint) to authenticated, service_role;
revoke all on function public.admin_retry_purchase_order(bigint) from public, anon, authenticated;
grant execute on function public.admin_retry_purchase_order(bigint) to authenticated, service_role;
revoke all on function public.admin_reorder_candidates(integer) from public, anon, authenticated;
grant execute on function public.admin_reorder_candidates(integer) to authenticated, service_role;
revoke all on function public.supplier_list_my_orders() from public, anon, authenticated;
grant execute on function public.supplier_list_my_orders() to authenticated, service_role;
revoke all on function public.supplier_respond_order(bigint, boolean, date, text) from public, anon, authenticated;
grant execute on function public.supplier_respond_order(bigint, boolean, date, text) to authenticated, service_role;

commit;
