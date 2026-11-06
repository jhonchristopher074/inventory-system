-- =====================================================================
-- Order again: low stock -> an order to the product's supplier
-- ---------------------------------------------------------------------
-- Run after 20261108000001_receipt_notes_qty.sql.
--
-- 1. Every product has a supplier (a supplier account: its email is where
--    orders go). products.supplier_id is set
--      - by itself, when a receipt is confirmed: the supplier who uploaded
--        it, or (staff / owner uploads) the supplier account whose name is
--        the receipt's "supplier name". The newest receipt wins.
--      - by the owner, in Inventory > Order again (admin_set_product_supplier)
--    Products already in stock get theirs from their past receipts below.
-- 2. The owner picks the low products, the pieces, checks the order and
--    presses Send: admin_create_purchase_order saves it as 'to_send'.
-- 3. n8n (sends the email) reads the 'to_send' orders, emails each
--    supplier, then marks the order 'sent' (or 'failed' with the reason):
--
--      select public.n8n_purchase_orders_to_send();
--        -> [{ id, supplier_name, supplier_email, note, created_at,
--              ordered_by, items: [{ product_id, product_name, qty, stock_then }] }]
--      select public.n8n_mark_purchase_order(<id>, true, null);        -- sent
--      select public.n8n_mark_purchase_order(<id>, false, 'why');      -- failed
--
--    Both only work with the service_role key (n8n's Supabase credential).
--    To start the workflow at once instead of on a timer, add a Database
--    Webhook on purchase_orders INSERT (Supabase > Database > Webhooks).
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists supplier_id uuid references public.profiles (id) on delete set null;

create table if not exists public.purchase_orders (
  id              bigserial primary key,
  supplier_id     uuid references public.profiles (id) on delete set null,
  supplier_name   text not null,
  supplier_email  text not null,
  note            text,
  status          text not null default 'to_send'
                  check (status in ('to_send', 'sent', 'failed', 'cancelled')),
  error           text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create table if not exists public.purchase_order_items (
  id           bigserial primary key,
  order_id     bigint not null references public.purchase_orders (id) on delete cascade,
  product_id   bigint,
  product_name text not null,
  qty          integer not null check (qty > 0),
  stock_then   integer
);

create index if not exists purchase_order_items_order on public.purchase_order_items (order_id);

-- only through the functions below (n8n's service_role skips RLS)
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

-- ---------------------------------------------------------------------
-- The supplier account of a receipt (receipt_review_items.upload_ref)
-- ---------------------------------------------------------------------
create or replace function public.receipt_supplier_of(p_ref text)
 returns uuid
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  su   supplier_uploads%rowtype;
  v_id uuid;
begin
  if p_ref is null or p_ref !~ '^[0-9]+$' then
    return null;
  end if;

  select * into su from supplier_uploads where id = p_ref::bigint;
  if not found then
    return null;
  end if;

  -- uploaded by the supplier himself
  if exists (select 1 from profiles where id = su.supplier_id and role = 'supplier') then
    return su.supplier_id;
  end if;

  -- staff / owner upload: the supplier account with that name (only if one)
  if nullif(btrim(coalesce(su.supplier_name, '')), '') is not null then
    select min(p.id::text)::uuid into v_id
      from profiles p
     where p.role = 'supplier'
       and lower(btrim(p.full_name)) = lower(btrim(su.supplier_name))
    having count(*) = 1;
    return v_id;
  end if;

  return null;
end;
$function$;

-- a confirmed receipt: its products are from its supplier
create or replace function public.receipt_review_items_set_supplier()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_supplier uuid;
begin
  if new.decision = 'approved' and old.decision is distinct from 'approved'
     and new.product_id ~ '^[0-9]+$' then
    v_supplier := public.receipt_supplier_of(new.upload_ref);
    if v_supplier is not null then
      update products set supplier_id = v_supplier where id = new.product_id::bigint;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists receipt_review_items_set_supplier on public.receipt_review_items;
create trigger receipt_review_items_set_supplier
  after update of decision on public.receipt_review_items
  for each row execute function public.receipt_review_items_set_supplier();

-- products already in stock: the supplier of their newest confirmed receipt
update public.products p
   set supplier_id = s.supplier
  from (
    select distinct on (i.product_id)
           i.product_id, public.receipt_supplier_of(i.upload_ref) as supplier
      from public.receipt_review_items i
     where i.decision = 'approved'
       and i.product_id ~ '^[0-9]+$'
       and public.receipt_supplier_of(i.upload_ref) is not null
     order by i.product_id, i.decided_at desc nulls last, i.id desc
  ) s
 where p.id = s.product_id::bigint
   and p.supplier_id is null;

-- ---------------------------------------------------------------------
-- Owner: the low products with their supplier, and the supplier accounts
-- ---------------------------------------------------------------------
create or replace function public.admin_reorder_candidates(p_low integer default 10)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
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
               -- already in an order that isn't finished / sent in the last 7 days
               'last_order', (
                 select jsonb_build_object('status', o.status, 'at', o.created_at, 'qty', oi.qty)
                   from purchase_order_items oi
                   join purchase_orders o on o.id = oi.order_id
                  where oi.product_id = p.id
                    and (o.status in ('to_send', 'failed')
                         or (o.status = 'sent' and o.created_at > now() - interval '7 days'))
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
       where s.role = 'supplier' and coalesce(s.is_active, true) and s.email is not null
    ), '[]'::jsonb));
end;
$function$;

create or replace function public.admin_set_product_supplier(p_product_id bigint, p_supplier_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  if p_supplier_id is not null
     and not exists (select 1 from profiles where id = p_supplier_id and role = 'supplier') then
    raise exception 'That supplier account was not found.';
  end if;

  update products set supplier_id = p_supplier_id where id = p_product_id;
  if not found then
    raise exception 'That product was not found.';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Owner: send an order (one supplier), cancel one, the list
--   p_items: [{ "product_id": 12, "qty": 20 }]
-- ---------------------------------------------------------------------
create or replace function public.admin_create_purchase_order(
  p_supplier_id uuid,
  p_items       jsonb,
  p_note        text default null
)
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
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select * into s from profiles where id = p_supplier_id and role = 'supplier';
  if not found then
    raise exception 'That supplier account was not found.';
  end if;
  if nullif(btrim(coalesce(s.email, '')), '') is null then
    raise exception 'This supplier has no email, so the order can''t be sent.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Pick at least one product to order.';
  end if;
  if length(coalesce(v_note, '')) > 500 then
    raise exception 'The note is too long (500 characters at most).';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name from profiles where id = auth.uid();

  insert into purchase_orders (supplier_id, supplier_name, supplier_email, note, created_by_name)
  values (s.id, coalesce(nullif(btrim(s.full_name), ''), s.email), btrim(s.email), v_note, v_name)
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

create or replace function public.admin_cancel_purchase_order(p_order_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  update purchase_orders set status = 'cancelled'
   where id = p_order_id and status in ('to_send', 'failed');
  if not found then
    raise exception 'This order was already sent, so it can''t be cancelled here.';
  end if;
end;
$function$;

-- a failed one goes back to n8n
create or replace function public.admin_retry_purchase_order(p_order_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  update purchase_orders set status = 'to_send', error = null
   where id = p_order_id and status = 'failed';
  if not found then
    raise exception 'Only an order that failed can be sent again.';
  end if;
end;
$function$;

create or replace function public.admin_list_purchase_orders()
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
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
             'items', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'product_id', i.product_id, 'product_name', i.product_name,
                        'qty', i.qty, 'stock_then', i.stock_then) order by i.id)
                 from purchase_order_items i where i.order_id = o.id), '[]'::jsonb))
           order by o.created_at desc)
      from purchase_orders o
     where o.created_at > now() - interval '60 days'
  ), '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------
-- n8n (service_role only): the orders to email, and the result
-- ---------------------------------------------------------------------
create or replace function public.n8n_purchase_orders_to_send()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'supplier_name', o.supplier_name,
           'supplier_email', o.supplier_email,
           'note', o.note,
           'created_at', o.created_at,
           'ordered_by', o.created_by_name,
           'items', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'product_id', i.product_id, 'product_name', i.product_name,
                      'qty', i.qty, 'stock_then', i.stock_then) order by i.id)
               from purchase_order_items i where i.order_id = o.id), '[]'::jsonb))
         order by o.id), '[]'::jsonb)
    from purchase_orders o
   where o.status = 'to_send';
$function$;

create or replace function public.n8n_mark_purchase_order(p_order_id bigint, p_sent boolean, p_error text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  o purchase_orders%rowtype;
begin
  update purchase_orders
     set status = case when p_sent then 'sent' else 'failed' end,
         sent_at = case when p_sent then now() end,
         error = case when p_sent then null else left(coalesce(p_error, 'Not sent'), 300) end
   where id = p_order_id and status = 'to_send'
  returning * into o;

  if not found then
    return; -- cancelled meanwhile, or already marked
  end if;

  insert into notifications (title, message, type, is_read, recipient_role)
  values (
    case when p_sent then 'Order sent' else 'Order not sent' end,
    case when p_sent
      then format('Your order was emailed to %s (%s).', o.supplier_name, o.supplier_email)
      else format('Your order to %s couldn''t be emailed: %s. Open Inventory > Orders to try again.', o.supplier_name, o.error)
    end,
    'purchase_order', false, 'admin');
end;
$function$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.receipt_supplier_of(text) from public, anon, authenticated;
revoke execute on function public.receipt_review_items_set_supplier() from public, anon, authenticated;
revoke execute on function public.admin_reorder_candidates(integer) from public, anon;
revoke execute on function public.admin_set_product_supplier(bigint, uuid) from public, anon;
revoke execute on function public.admin_create_purchase_order(uuid, jsonb, text) from public, anon;
revoke execute on function public.admin_cancel_purchase_order(bigint) from public, anon;
revoke execute on function public.admin_list_purchase_orders() from public, anon;
revoke execute on function public.admin_retry_purchase_order(bigint) from public, anon;
grant execute on function public.admin_retry_purchase_order(bigint) to authenticated;
revoke execute on function public.n8n_purchase_orders_to_send() from public, anon, authenticated;
revoke execute on function public.n8n_mark_purchase_order(bigint, boolean, text) from public, anon, authenticated;

grant execute on function public.admin_reorder_candidates(integer) to authenticated;
grant execute on function public.admin_set_product_supplier(bigint, uuid) to authenticated;
grant execute on function public.admin_create_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.admin_cancel_purchase_order(bigint) to authenticated;
grant execute on function public.admin_list_purchase_orders() to authenticated;
grant execute on function public.n8n_purchase_orders_to_send() to service_role;
grant execute on function public.n8n_mark_purchase_order(bigint, boolean, text) to service_role;

commit;

-- check: products and their supplier
select p.id, p.name, p.quantity, s.full_name as supplier, s.email
  from public.products p
  left join public.profiles s on s.id = p.supplier_id
 order by p.quantity nulls first
 limit 15;
