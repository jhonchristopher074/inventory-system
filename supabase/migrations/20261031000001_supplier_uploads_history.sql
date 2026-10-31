-- =====================================================================
-- Supplier page, My uploads: up to 500 uploads instead of 50
-- ---------------------------------------------------------------------
-- My uploads is now a data table with pages (10 / 15 / all), so it can
-- show a supplier's older receipts too. supplier_list_my_uploads gave at
-- most the newest 50; this lets it give up to 500. Nothing else changes:
-- a supplier still sees only their own uploads.
--
-- Until this is run the page still works and shows the newest 50.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.supplier_list_my_uploads(p_limit integer default 10)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['supplier']);

  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select su.id, su.file_name, su.status, su.created_at, su.forwarded_at,
           case
             when su.send_at is null then null
             else ceil(extract(epoch from su.send_at - now()))::integer
           end as seconds_to_send
      from supplier_uploads su
     where su.supplier_id = auth.uid()
     order by su.created_at desc
     limit least(greatest(coalesce(p_limit, 10), 1), 500)
  ) u;

  return v_rows;
end;
$function$;

revoke execute on function public.supplier_list_my_uploads(integer) from public, anon;
grant execute on function public.supplier_list_my_uploads(integer) to authenticated;
