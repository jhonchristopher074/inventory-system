-- =====================================================================
-- 2026-10-15 — URGENT security fix, plus two sale/product checks
--
-- 1. Nobody can make themselves an administrator anymore.
--    The project allowed open sign-up (anyone could create an account,
--    auto-confirmed), and a logged-in account could insert its OWN
--    profile row with any role — including 'admin'. Now only the
--    administrator (or the create-employee Edge Function) can create
--    profiles. Also turn sign-up off: Authentication > Sign In /
--    Providers > "Allow new users to sign up".
--
-- 2. Users can only change their own photo. Every other profile field
--    (name, email, role, account number, ...) is administrator-only.
--    (Before, only some fields were protected.)
--
-- 3. A login without a profile (e.g. made through sign-up) gets no access
--    at all. Before, such an account counted as "active".
--
-- 4. A sale with the same product on two cart lines is added together
--    before the stock check. Before, each line was checked separately
--    (so stock could go negative) and only one line was taken out of
--    stock while both were recorded as sold.
--
-- 5. New products can't have a negative quantity or price.
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Profiles can only be created by the administrator
-- ---------------------------------------------------------------------

drop policy if exists "profiles_insert_self_or_admin" on public.profiles;
drop policy if exists "profiles_insert_admin_only" on public.profiles;

create policy "profiles_insert_admin_only" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Users may change only their own photo
-- ---------------------------------------------------------------------

-- Applies to requests made by logged-in users through the app/API.
-- The administrator, Edge Functions (service key) and the SQL Editor
-- are not limited by it.
create or replace function public.protect_profile_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not is_admin() then
    if (to_jsonb(new) - 'avatar_url' - 'updated_at')
       is distinct from (to_jsonb(old) - 'avatar_url' - 'updated_at') then
      raise exception 'Only the administrator can change account details. You can change your photo and password.';
    end if;
  end if;
  return new;
end;
$function$;

-- make sure the check runs on profile updates (only added if missing)
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgfoid = 'public.protect_profile_privilege_fields'::regproc
      and not tgisinternal
  ) then
    create trigger protect_profile_privilege_fields
      before update on public.profiles
      for each row execute function public.protect_profile_privilege_fields();
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 3. No profile, no access
-- ---------------------------------------------------------------------

create or replace function public.require_auth()
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- every real account is created by the administrator, with a profile
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'This account is not set up. Please contact the administrator.';
  end if;

  if not public.is_account_active() then
    raise exception 'This account has been disabled';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Sales: same product on two lines is added together
-- ---------------------------------------------------------------------

create or replace function public.process_sale(p_cashier_id uuid, p_cashier_name text, p_cashier_email text, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sale_id    bigint;
  v_total      numeric := 0;
  v_line       record;
  v_product    products%rowtype;
  v_subtotal   numeric;
  v_sale_items jsonb := '[]'::jsonb;
  v_name       text;
  v_email      text;
begin
  perform public.require_role(array['cashier', 'admin']);

  if p_cashier_id is distinct from auth.uid() then
    raise exception 'Cannot record a sale for another user';
  end if;

  -- p_cashier_name / p_cashier_email are ignored
  select coalesce(nullif(trim(full_name), ''), email), email
    into v_name, v_email
    from profiles
   where id = auth.uid();

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Cart is empty';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- every line needs a product and a whole quantity of at least 1
  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where coalesce(e->>'product_id', '') !~ '^[0-9]{1,18}$'
       or coalesce(e->>'quantity', '') !~ '^[0-9]{1,9}$'
       or case when coalesce(e->>'quantity', '') ~ '^[0-9]{1,9}$'
               then (e->>'quantity')::integer <= 0
               else true end
  ) then
    raise exception 'Invalid quantity in cart';
  end if;

  -- one row per product (lines for the same product are added together),
  -- locked in id order so two sales can't deadlock
  for v_line in
    select (e->>'product_id')::bigint as product_id,
           sum((e->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    select * into v_product
    from products
    where id = v_line.product_id
      and is_archived = false
      and is_deleted = false
    for update;

    if not found then
      raise exception 'Product % not found or unavailable', v_line.product_id;
    end if;

    if v_product.quantity < v_line.qty then
      raise exception 'Insufficient stock for "%": requested %, available %',
        v_product.name, v_line.qty, v_product.quantity;
    end if;

    v_subtotal := v_product.price * v_line.qty;
    v_total := v_total + v_subtotal;

    v_sale_items := v_sale_items || jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_line.qty,
      'price',        v_product.price,
      'subtotal',     v_subtotal
    );
  end loop;

  insert into sales (cashier_id, cashier_name, cashier_email, total_amount)
  values (p_cashier_id, v_name, v_email, v_total)
  returning id into v_sale_id;

  insert into sale_items (sale_id, product_id, product_name, quantity, price, subtotal)
  select
    v_sale_id,
    (elem->>'product_id')::bigint,
    elem->>'product_name',
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    (elem->>'subtotal')::numeric
  from jsonb_array_elements(v_sale_items) elem;

  -- stock deduction here is what fires the low-stock trigger
  update products p
  set quantity = p.quantity - (elem->>'quantity')::integer
  from jsonb_array_elements(v_sale_items) elem
  where p.id = (elem->>'product_id')::bigint;

  perform public.notify(
    'New Sale Completed',
    format('%s completed sale #%s worth ₱%s.',
      coalesce(v_name, 'A cashier'), v_sale_id,
      to_char(v_total, 'FM999,999,990.00')),
    'sale'
  );

  return jsonb_build_object(
    'id',            v_sale_id,
    'cashier_id',    p_cashier_id,
    'cashier_name',  v_name,
    'cashier_email', v_email,
    'total_amount',  v_total,
    'items',         v_sale_items
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. New products: no negative quantity or price
-- ---------------------------------------------------------------------

create or replace function public.add_product(p_name text, p_category text, p_quantity integer, p_price numeric, p_image_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_product products%rowtype;
begin
  perform public.require_role(array['admin']);

  if p_name is null or trim(p_name) = '' then
    raise exception 'Product name is required';
  end if;

  if coalesce(p_quantity, 0) < 0 then
    raise exception 'Quantity must be 0 or more.';
  end if;

  if coalesce(p_price, 0) < 0 then
    raise exception 'Price must be 0 or more.';
  end if;

  insert into products (
    name, category, quantity, price, image_url,
    is_archived, is_deleted, approved_count, return_count
  )
  values (
    trim(p_name),
    coalesce(nullif(trim(coalesce(p_category, '')), ''), 'Uncategorized'),
    coalesce(p_quantity, 0),
    coalesce(p_price, 0),
    nullif(trim(coalesce(p_image_url, '')), ''),
    false, false, 0, 0
  )
  returning * into v_product;

  perform public.notify(
    'Product Added',
    format('%s was added to inventory.', v_product.name),
    'restore',
    v_product.id
  );

  return to_jsonb(v_product);
end;
$function$;

commit;
