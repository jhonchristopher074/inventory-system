-- =====================================================================
-- Find duplicate products (read-only: nothing is changed)
-- ---------------------------------------------------------------------
-- Receipts scanned twice (before the duplicate-receipt check existed) or
-- spelled slightly differently can create the same product more than once.
-- This lists products whose names are the same when capitals and extra
-- spaces are ignored. Archived products are included (marked); deleted
-- ones are not.
--
-- Run it in Supabase > SQL Editor. Nothing is merged or deleted: decide
-- per row which one to keep, then merge them (sales and stock history
-- point at a product's id, so don't just delete one).
-- =====================================================================

select
  lower(regexp_replace(trim(p.name), '\s+', ' ', 'g')) as same_name,
  count(*) as copies,
  string_agg(
    format('#%s %s: stock %s, ₱%s%s',
      p.id,
      p.name,
      coalesce(p.quantity, 0),
      coalesce(p.price, 0),
      case when p.is_archived then ' (archived)' else '' end),
    E'\n' order by p.id
  ) as products
from public.products p
where coalesce(p.is_deleted, false) = false
group by 1
having count(*) > 1
order by copies desc, same_name;
