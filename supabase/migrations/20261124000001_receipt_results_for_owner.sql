-- =====================================================================
-- Documentation > Order Receipt: what the receipt scanner read from each
-- receipt, for the Owner and the Manager: every product line with its
-- quantity, cost, price, and what became of it:
--   waiting    read, its prices not checked yet (Approval > Prices to check)
--   added      confirmed, its stock went in
--   not added  confirmed, but its stock isn't in (e.g. not delivered yet)
--   rejected   turned down
-- Read only; nothing changes. Safe to run more than once.
-- =====================================================================

begin;

-- an earlier version returned other columns
drop function if exists public.admin_list_receipt_results(integer);

create function public.admin_list_receipt_results(p_limit integer default 3000)
 returns table(upload_id bigint, product_name text, qty_added numeric, cost numeric, price numeric, is_new boolean, state text, read_at timestamp with time zone)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  return query
    select su.id,
           coalesce(nullif(btrim(i.product_name), ''), 'Product'),
           coalesce(nullif(to_jsonb(i)->>'qty_added', '')::numeric, 0),
           nullif(to_jsonb(i)->>'cost', '')::numeric,
           nullif(to_jsonb(i)->>'price', '')::numeric,
           coalesce(nullif(to_jsonb(i)->>'is_new', '')::boolean, false),
           case
             when lower(coalesce(to_jsonb(i)->>'status', '')) like 'reject%'
               or lower(coalesce(to_jsonb(i)->>'decision', '')) like 'reject%' then 'rejected'
             when lower(coalesce(to_jsonb(i)->>'status', '')) in ('', 'pending') then 'waiting'
             when coalesce(nullif(to_jsonb(i)->>'stock_applied', '')::boolean, true) then 'added'
             else 'not added'
           end,
           i.created_at
      from public.receipt_review_items i
      join public.supplier_uploads su on su.id::text = i.upload_ref
     order by 1 desc, i.id
     limit least(greatest(coalesce(p_limit, 3000), 1), 10000);
end;
$function$;

revoke all on function public.admin_list_receipt_results(integer) from public, anon, authenticated;
grant execute on function public.admin_list_receipt_results(integer) to authenticated;
grant execute on function public.admin_list_receipt_results(integer) to service_role;

commit;
