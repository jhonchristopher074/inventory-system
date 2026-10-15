-- =====================================================================
-- 2026-10-15 (run AFTER 20261015000004)
--
-- "Overdue Inspection" warnings were sent only once per product, ever:
-- after the first one, a product that was rescheduled and became overdue
-- again never warned anybody. Now each product remembers which
-- inspection date it already warned about (overdue_notified_for), so
-- every scheduled inspection can warn once.
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

alter table public.products
  add column if not exists overdue_notified_for date;

-- Products that already got a warning for their CURRENT inspection date
-- (sent after that date passed) don't get a second one.
update public.products p
   set overdue_notified_for = p.inspection_date
 where p.inspection_date is not null
   and p.overdue_notified_for is null
   and exists (
     select 1 from public.notifications n
     where n.product_id = p.id
       and n.type = 'overdue'
       and n.created_at >= p.inspection_date
   );

create or replace function public.create_overdue_notification(p_product_id bigint, p_total_done integer, p_quantity integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_product products%rowtype;
  v_id      bigint;
begin
  perform public.require_role(array['admin']);

  -- locked, so two open calendars can't both send the same warning
  select * into v_product from products where id = p_product_id for update;

  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  -- not overdue: no inspection date, or the date hasn't passed yet
  if v_product.inspection_date is null
     or v_product.inspection_date >= (now() at time zone 'Asia/Manila')::date then
    return jsonb_build_object('created', false);
  end if;

  -- already warned about this inspection date
  if v_product.overdue_notified_for is not distinct from v_product.inspection_date then
    return jsonb_build_object('created', false);
  end if;

  update products
     set overdue_notified_for = v_product.inspection_date
   where id = p_product_id;

  v_id := public.notify(
    'Overdue Inspection',
    format('%s inspection is overdue. Inspected %s out of %s.',
      v_product.name, coalesce(p_total_done, 0), coalesce(p_quantity, 0)),
    'overdue',
    p_product_id
  );

  return jsonb_build_object('created', true, 'notification_id', v_id);
end;
$function$;

commit;
