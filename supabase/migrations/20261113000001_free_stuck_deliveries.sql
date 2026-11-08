-- =====================================================================
-- Deliveries stuck on a receipt that's gone
-- ---------------------------------------------------------------------
-- Run after 20261112000001_stock_history_current_names.sql.
--
-- The bug: a delivery showed "Arrived · waiting for receipt", but every
-- upload for it said "That delivery already has its receipt." It was still
-- linked (deliveries.upload_id) to a receipt that was denied before the
-- unlink rule of 20261107000001 existed, or that was deleted.
--
--   1. Frees those deliveries now (and denied receipts let go of theirs).
--   2. From now on, a receipt deleted any way frees its delivery too
--      (a denied one already did).
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- 1. linked to a receipt that's missing or denied: free again
update public.deliveries d
   set upload_id = null
 where d.upload_id is not null
   and not exists (
     select 1 from public.supplier_uploads su
      where su.id = d.upload_id and su.status <> 'rejected'
   );

update public.supplier_uploads
   set delivery_id = null
 where status = 'rejected' and delivery_id is not null;

-- 2. a receipt deleted: its delivery waits for a receipt again
create or replace function public.supplier_uploads_free_delivery_on_delete()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update deliveries set upload_id = null where upload_id = old.id;
  return old;
end;
$function$;

drop trigger if exists supplier_uploads_free_delivery_on_delete on public.supplier_uploads;
create trigger supplier_uploads_free_delivery_on_delete
  before delete on public.supplier_uploads
  for each row execute function public.supplier_uploads_free_delivery_on_delete();

revoke execute on function public.supplier_uploads_free_delivery_on_delete() from public, anon, authenticated;

commit;

-- check: deliveries that arrived and wait for their receipt (roof should
-- be here, with upload_id empty)
select id, title, status, needs_receipt, upload_id
  from public.deliveries
 where needs_receipt and lower(coalesce(status, '')) = 'delivered'
 order by delivery_date desc
 limit 10;
