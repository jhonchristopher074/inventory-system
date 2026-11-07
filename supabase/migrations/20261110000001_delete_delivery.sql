-- =====================================================================
-- Calendar: the owner can delete a delivery
-- ---------------------------------------------------------------------
-- Run after 20261109000001_reorder_low_stock.sql.
--
-- For a delivery scheduled by mistake, or one that isn't coming. One that
-- already has its receipt (upload_id) can't be deleted: the receipt and
-- its stock belong to it. The staff are told it was taken off.
--
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.admin_delete_delivery(p_delivery_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  d deliveries%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  select * into d from deliveries where id = p_delivery_id for update;
  if not found then
    raise exception 'That delivery was already deleted.';
  end if;
  if d.upload_id is not null then
    raise exception 'This delivery already has its receipt, so it can''t be deleted.';
  end if;

  -- (a denied or taken-back receipt may still point at it)
  update supplier_uploads set delivery_id = null where delivery_id = d.id;
  delete from deliveries where id = d.id;

  insert into notifications (title, message, type, is_read, recipient_role)
  values (
    'Delivery removed',
    format('The owner removed the delivery "%s"%s from the calendar.',
      d.title,
      case when nullif(btrim(coalesce(d.supplier, '')), '') is not null then ' from ' || btrim(d.supplier) else '' end),
    'delivery', false, 'staff');
end;
$function$;

revoke execute on function public.admin_delete_delivery(bigint) from public, anon;
grant execute on function public.admin_delete_delivery(bigint) to authenticated;

commit;
