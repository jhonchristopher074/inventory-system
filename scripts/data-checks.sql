-- Checks that the money and stock in the database add up. Read-only.
-- One row per check: how many rows break it (0 = fine) and a few examples.
-- Run every night by .github/workflows/backup.yml; by hand:
--   npx supabase db query --remote --read-only -f scripts/data-checks.sql
--
-- What must always be true (process_sale and refund_apply keep it so):
--   a sale's total = the subtotals of its products
--   a product line's subtotal = its price x the pieces still sold
--   a sale's refunded amount = its approved refunds
--   an approved refund's amount = its products' amounts
--   no stock below 0, no line with fewer than 0 pieces
--   a product's stock = where its stock history ends

with
sale_sums as (
  select s.id, s.total_amount, s.refunded_amount,
         coalesce(sum(i.subtotal), 0) as items_total,
         count(i.id) as lines
    from sales s
    left join sale_items i on i.sale_id = s.id
   group by s.id
),
refund_sums as (
  select r.sale_id, sum(r.amount) as approved
    from refund_requests r
   where r.status = 'approved'
   group by r.sale_id
),
last_movement as (
  select distinct on (m.product_id) m.product_id, m.new_quantity
    from stock_movements m
   order by m.product_id, m.created_at desc, m.id desc
),
checks as (
  select 'Sale total differs from its products' as check_name,
         count(*) as problems,
         string_agg('#' || id || ' (' || total_amount || ' vs ' || items_total || ')', ', ' order by id desc) as examples
    from sale_sums
   where lines > 0 and abs(total_amount - items_total) > 0.01

  union all
  select 'Sale with no products', count(*), string_agg('#' || id, ', ' order by id desc)
    from sale_sums where lines = 0

  union all
  select 'Product line subtotal is not price x pieces', count(*),
         string_agg('sale #' || sale_id || ' ' || product_name, ', ' order by id desc)
    from sale_items
   where abs(coalesce(subtotal, 0) - price * quantity) > 0.01

  union all
  select 'Negative pieces in a sale', count(*), string_agg('sale #' || sale_id || ' ' || product_name, ', ' order by id desc)
    from sale_items where quantity < 0 or refunded_qty < 0

  union all
  select 'Refunded amount differs from approved refunds', count(*),
         string_agg('#' || s.id || ' (' || s.refunded_amount || ' vs ' || coalesce(r.approved, 0) || ')', ', ' order by s.id desc)
    from sales s
    left join refund_sums r on r.sale_id = s.id
   where abs(coalesce(s.refunded_amount, 0) - coalesce(r.approved, 0)) > 0.01

  union all
  select 'Refund amount differs from its products', count(*), string_agg('refund #' || x.id, ', ' order by x.id desc)
    from (select r.id, r.amount, coalesce(sum(i.amount), 0) as items
            from refund_requests r
            left join refund_request_items i on i.request_id = r.id
           where r.status = 'approved'
           group by r.id) x
   where abs(x.amount - x.items) > 0.01

  union all
  select 'Stock below 0', count(*), string_agg(name || ' (' || quantity || ')', ', ' order by name)
    from products where quantity < 0

  union all
  select 'Stock differs from its stock history', count(*),
         string_agg(p.name || ' (' || p.quantity || ' vs ' || m.new_quantity || ')', ', ' order by p.name)
    from products p
    join last_movement m on m.product_id = p.id
   where p.quantity <> m.new_quantity
)
select check_name, problems, left(coalesce(examples, ''), 300) as examples
  from checks
 order by problems desc, check_name;
