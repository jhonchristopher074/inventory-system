-- =====================================================================
-- Fix: "null value in column "title" of relation "documentations"
-- violates not-null constraint" when staff press Submit Report.
-- ---------------------------------------------------------------------
-- The document saved with each product report had no title, but the
-- title column is required. It now gets one, e.g.
-- "Low Stock: 2024 PROMO - WIRE MESH w/20 pcs hook". Otherwise the same
-- as 20261015000001.
-- =====================================================================

create or replace function public.submit_product_report(p_product_id bigint, p_product_name text, p_report_type text, p_description text, p_reported_by text, p_image_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_notification_id bigint;
  v_me text;
  v_type text;
begin
  perform public.require_role(array['admin', 'staff']);

  -- p_reported_by is ignored: the name comes from the logged-in profile
  v_me := coalesce(public.my_display_name(), 'Staff');
  v_type := coalesce(nullif(trim(p_report_type), ''), 'Report');

  if p_description is null or trim(p_description) = '' then
    raise exception 'Report description is required';
  end if;

  v_notification_id := public.notify(
    format('Product Report: %s', v_type),
    format('%s - %s', p_product_name, trim(p_description)),
    'report',
    p_product_id,
    '/inventory'
  );

  insert into documentations (title, product_id, product_name, type, description, receipt_image_url, created_by, created_by_id)
  values (
    format('%s: %s', v_type, coalesce(nullif(trim(p_product_name), ''), 'Product')),
    p_product_id,
    p_product_name,
    'Product Report',
    format('Reported by %s. Issue: %s. Details: %s',
      v_me, v_type, trim(p_description)),
    p_image_url,
    v_me,
    auth.uid()
  );

  return jsonb_build_object('notification_id', v_notification_id, 'product_id', p_product_id);
end;
$function$;
