-- =====================================================================
-- Data policy: disable, don't archive or delete
-- ---------------------------------------------------------------------
-- Products are disabled (hidden from Inventory and the POS) instead of
-- archived or deleted, so no record is ever lost. The app now calls it
-- Disable / Enable; in the database a disabled product is still
-- is_archived = true (same column, nothing to migrate).
--
-- This file:
--   1. stops products from being deleted: soft_delete_product now refuses
--      (the app no longer has a Delete button; this also covers someone
--      calling the database directly)
--   2. brings back the products deleted before this rule, as disabled
--      products, so they show under Disabled and can be enabled again
--
-- Accounts already work this way (Disable account / Enable account on the
-- Profile page; nobody's account is deleted).
-- Safe to run more than once.
-- =====================================================================

begin;

-- 1. nothing is deleted any more
create or replace function public.soft_delete_product(p_product_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);
  raise exception 'Products are not deleted any more: disable them instead (they stay under Disabled).';
end;
$function$;

-- 2. products deleted before: back as disabled products
update public.products
   set is_deleted = false,
       deleted_at = null,
       is_archived = true
 where is_deleted = true;

commit;

-- check: how many products are disabled now, and that none is deleted
select
  count(*) filter (where is_archived and not is_deleted) as disabled_products,
  count(*) filter (where is_deleted)                     as deleted_products
from public.products;
