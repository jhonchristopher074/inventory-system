-- =====================================================================
-- Documentation > Order Receipt: the products each approved receipt put
-- into the inventory, for the Owner and the Manager.
--
-- The same rows a supplier already sees for their own receipts
-- (supplier_list_receipt_results), for every receipt: decided, not
-- rejected, and their stock really went in. Read only; nothing changes.
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.admin_list_receipt_results(p_limit integer default 2000)
 returns table(upload_id bigint, product_name text, qty_added numeric, price numeric, is_new boolean, confirmed_at timestamp with time zone)
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
           nullif(to_jsonb(i)->>'price', '')::numeric,
           coalesce(nullif(to_jsonb(i)->>'is_new', '')::boolean, false),
           coalesce(
             nullif(to_jsonb(i)->>'decided_at', '')::timestamptz,
             i.created_at
           )
      from public.receipt_review_items i
      join public.supplier_uploads su on su.id::text = i.upload_ref
     -- decided, and not rejected
     where lower(coalesce(to_jsonb(i)->>'status', '')) not in ('', 'pending')
       and lower(coalesce(to_jsonb(i)->>'status', '')) not like 'reject%'
       and lower(coalesce(to_jsonb(i)->>'decision', '')) not like 'reject%'
       -- its stock really went in
       and coalesce(nullif(to_jsonb(i)->>'stock_applied', '')::boolean, true)
     order by 6 desc, 1 desc
     limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end;
$function$;

revoke all on function public.admin_list_receipt_results(integer) from public, anon, authenticated;
grant execute on function public.admin_list_receipt_results(integer) to authenticated;
grant execute on function public.admin_list_receipt_results(integer) to service_role;

commit;
