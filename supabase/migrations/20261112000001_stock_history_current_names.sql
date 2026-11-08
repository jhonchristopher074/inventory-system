-- =====================================================================
-- Stock history: the person's name as it is now
-- ---------------------------------------------------------------------
-- Run after 20261111000001_reset_email_check.sql.
--
-- Each change keeps the name the person had when it happened
-- (changed_by_name). Someone renamed later still showed the old name on
-- every past change. Now list_stock_movements gives:
--   changed_by_name      the name now (from their account), or the one
--                        recorded when the account is gone / it was n8n
--   recorded_by_name     the name recorded at the time (for the audit file)
-- It can also give up to 5000 rows (the export asks for all of them).
--
-- Nothing stored is changed. Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.list_stock_movements(p_product_id bigint default null, p_limit integer default 200)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(
           to_jsonb(m) || jsonb_build_object(
             'changed_by_name', coalesce(nullif(btrim(p.full_name), ''), p.email, m.changed_by_name),
             'recorded_by_name', m.changed_by_name)
           order by m.created_at desc, m.id desc), '[]'::jsonb)
    into v_rows
  from (
    select *
    from stock_movements
    where p_product_id is null or product_id = p_product_id
    order by created_at desc, id desc
    limit least(greatest(coalesce(p_limit, 200), 1), 5000)
  ) m
  left join profiles p on p.id = m.changed_by;

  return v_rows;
end;
$function$;

revoke execute on function public.list_stock_movements(bigint, integer) from public, anon;
grant execute on function public.list_stock_movements(bigint, integer) to authenticated;

commit;
