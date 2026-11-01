-- =====================================================================
-- POS: the cashier can disable a product, and the owner is told
-- ---------------------------------------------------------------------
-- Disabling is not archiving. A disabled product stays in Inventory and
-- in the POS, marked "Disabled" with the cashier's reason, and can't be
-- sold until the owner enables it again (e.g. damaged, expired, wrong
-- price). The Archive module is unchanged.
--
--   disable_product(id, reason)   cashier or owner; the owner gets a
--                                 notification (and an email, if the
--                                 notify-owner-email function is set up)
--   enable_product(id)            owner only
--   list_disabled_products()      what the POS and Inventory mark
--   a check on sale_items         a disabled product can't be sold, from
--                                 whichever screen the sale comes
--
-- Also puts back soft_delete_product (the archive's Delete) as it was, in
-- case 20261101000003_disable_not_delete.sql was run: that file is gone.
--
-- Until this is run, the POS works as before and its Disable button
-- says the database part isn't set up yet.
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The archive's Delete, as it was before 20261101000003
-- ---------------------------------------------------------------------
create or replace function public.soft_delete_product(p_product_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update public.products
     set is_deleted = true,
         deleted_at = now()
   where id = p_product_id
     and is_archived = true
     and is_deleted = false;

  if not found then
    raise exception 'Product not found in the archive.';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Who disabled what, when and why
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists is_disabled         boolean not null default false,
  add column if not exists disabled_reason     text,
  add column if not exists disabled_at         timestamptz,
  add column if not exists disabled_by         uuid references auth.users (id) on delete set null,
  add column if not exists disabled_by_name    text,
  -- when the owner was emailed about it (the email goes out once)
  add column if not exists disabled_emailed_at timestamptz;

-- ---------------------------------------------------------------------
-- The disabled products, for the POS and Inventory
-- ---------------------------------------------------------------------
create or replace function public.list_disabled_products()
 returns table (id bigint, reason text, disabled_at timestamptz, disabled_by_name text)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin', 'cashier', 'staff']);

  return query
    select p.id, p.disabled_reason, p.disabled_at, p.disabled_by_name
    from public.products p
    where p.is_disabled
      and not coalesce(p.is_deleted, false);
end;
$function$;

-- ---------------------------------------------------------------------
-- Disable (cashier or owner): with a reason, and the owner is notified
-- ---------------------------------------------------------------------
create or replace function public.disable_product(p_product_id bigint, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_name    text;
  v_product text;
  v_id      bigint;
begin
  perform public.require_role(array['cashier', 'admin']);

  if length(v_reason) < 3 then
    raise exception 'Say why the product is disabled (at least 3 characters).';
  end if;
  if length(v_reason) > 200 then
    raise exception 'The reason is too long (200 characters at most).';
  end if;

  select coalesce(nullif(btrim(full_name), ''), email) into v_name
  from public.profiles where id = auth.uid();

  update public.products
     set is_disabled         = true,
         disabled_reason     = v_reason,
         disabled_at         = now(),
         disabled_by         = auth.uid(),
         disabled_by_name    = v_name,
         disabled_emailed_at = null
   where id = p_product_id
     and not is_disabled
     and not coalesce(is_archived, false)
     and not coalesce(is_deleted, false)
  returning name into v_product;

  if v_product is null then
    raise exception 'This product is already disabled, or no longer in the POS.';
  end if;

  v_id := public.notify(
    'Product Disabled',
    format('%s disabled "%s" at the POS: %s', coalesce(v_name, 'A cashier'), v_product, v_reason),
    'disabled',
    p_product_id
  );

  -- for the owner only (where notifications can be aimed at a role)
  if v_id is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'recipient_role'
  ) then
    execute 'update public.notifications set recipient_role = $1 where id = $2' using 'admin', v_id;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Enable (owner only)
-- ---------------------------------------------------------------------
create or replace function public.enable_product(p_product_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update public.products
     set is_disabled         = false,
         disabled_reason     = null,
         disabled_at         = null,
         disabled_by         = null,
         disabled_by_name    = null,
         disabled_emailed_at = null
   where id = p_product_id
     and is_disabled;

  if not found then
    raise exception 'This product is not disabled.';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- A disabled product can't be sold (whatever records the sale)
-- ---------------------------------------------------------------------
create or replace function public.block_disabled_product_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if exists (select 1 from public.products where id = new.product_id and is_disabled) then
    raise exception '"%" is disabled and can''t be sold. Remove it from the cart.', new.product_name;
  end if;
  return new;
end;
$function$;

drop trigger if exists block_disabled_product_sale on public.sale_items;
create trigger block_disabled_product_sale
  before insert on public.sale_items
  for each row execute function public.block_disabled_product_sale();

revoke execute on function public.list_disabled_products() from public, anon;
revoke execute on function public.disable_product(bigint, text) from public, anon;
revoke execute on function public.enable_product(bigint) from public, anon;
grant execute on function public.list_disabled_products() to authenticated;
grant execute on function public.disable_product(bigint, text) to authenticated;
grant execute on function public.enable_product(bigint) to authenticated;

commit;

-- check: the new columns and functions are there
select count(*) filter (where is_disabled) as disabled_products from public.products;
