-- =====================================================================
-- Supplier page: which products the owner added from your receipt
-- ---------------------------------------------------------------------
-- When the owner confirms a scanned receipt on the Approval page (Confirm
-- & add to stock), the supplier who uploaded it sees a confirmation: the
-- products from that receipt and how many were added to the inventory.
--
-- The supplier sees only product names and quantities, never the owner's
-- cost, profit percentage or selling price, and only for their own
-- receipts.
--
-- Read from receipt_review_items (one row per product a receipt added or
-- restocked). A row counts as added when it isn't waiting any more, wasn't
-- rejected, and its stock was applied. Columns that differ between
-- versions of that table are read by name through to_jsonb, so this works
-- with each of them.
--
-- Until this is run, the supplier page works as before.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.supplier_list_receipt_results(p_limit integer default 300)
 returns table (
   upload_id    bigint,
   product_name text,
   qty_added    numeric,
   is_new       boolean,
   confirmed_at timestamptz
 )
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['supplier']);

  return query
    select su.id,
           coalesce(nullif(btrim(i.product_name), ''), 'Product'),
           coalesce(nullif(to_jsonb(i)->>'qty_added', '')::numeric, 0),
           coalesce(nullif(to_jsonb(i)->>'is_new', '')::boolean, false),
           coalesce(
             nullif(to_jsonb(i)->>'reviewed_at', '')::timestamptz,
             nullif(to_jsonb(i)->>'decided_at', '')::timestamptz,
             nullif(to_jsonb(i)->>'confirmed_at', '')::timestamptz,
             nullif(to_jsonb(i)->>'updated_at', '')::timestamptz,
             i.created_at
           )
      from public.receipt_review_items i
      join public.supplier_uploads su on su.id::text = i.upload_ref
     where su.supplier_id = auth.uid()
       -- decided, and not rejected
       and lower(coalesce(to_jsonb(i)->>'status', '')) not in ('', 'pending')
       and lower(coalesce(to_jsonb(i)->>'status', '')) not like 'reject%'
       and lower(coalesce(to_jsonb(i)->>'decision', '')) not like 'reject%'
       -- its stock really went in
       and coalesce(nullif(to_jsonb(i)->>'stock_applied', '')::boolean, true)
     order by 5 desc, 1 desc
     limit least(greatest(coalesce(p_limit, 300), 1), 1000);
end;
$function$;

revoke execute on function public.supplier_list_receipt_results(integer) from public, anon;
grant execute on function public.supplier_list_receipt_results(integer) to authenticated;
