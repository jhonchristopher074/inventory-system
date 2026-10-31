-- Check the receipt profit percentage (read-only: nothing is changed)
-- ---------------------------------------------------------------------
-- Shows how the database adds the owner's profit percentage to a receipt's
-- products, and what it did for the latest receipts:
--   function / trigger   the receipt and markup code in the database
--   markups              the percentages saved when receipts were approved
--   review items         the latest products the receipt scanner added
-- Run it in Supabase > SQL Editor, then export the result as CSV
-- (or copy all rows) and send it.

select 'function' as kind, p.proname::text as name, pg_get_functiondef(p.oid) as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and (p.proname ilike any (array['%receipt%', '%markup%', '%n8n%', '%scan%'])
        or p.oid in (select t.tgfoid from pg_trigger t where not t.tgisinternal))

union all

select 'trigger', t.tgname || ' on ' || c.relname, pg_get_triggerdef(t.oid)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'storage')
   and not t.tgisinternal

union all

select 'markups', 'latest 20', (
  select jsonb_agg(to_jsonb(m))::text
    from (select * from public.receipt_markups limit 20) m
)

union all

select 'review items', 'latest 20', (
  select jsonb_agg(to_jsonb(r))::text
    from (select * from public.receipt_review_items order by id desc limit 20) r
);
