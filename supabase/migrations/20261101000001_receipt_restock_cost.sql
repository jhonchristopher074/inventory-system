-- =====================================================================
-- Receipts: the profit percentage also works for restocked products
-- ---------------------------------------------------------------------
-- The owner's profit percentage was only added to NEW products. For a
-- product that was restocked, the receipt scanner doesn't send the cost
-- (last_cost stays empty), so there was nothing to add the percentage to:
-- the suggested price stayed the product's old price, whatever % was chosen.
-- (Seen on receipts 86, 87 and 88: 10%, 23% and 15%, same prices each time.)
--
-- Now a restock's cost is, in this order:
--   1. last_cost, when the scanner sends it
--   2. the price the scanner sent, when it changed it (the scanner sends a
--      receipt's unit cost as the price, as it does for new products)
--   3. the cost from this product's latest receipt
-- and the suggested price is that cost + the percentage, as for new products.
--
-- Also fills in the cost of restocks still waiting in "New prices to check",
-- with their suggested price.
-- Only log_receipt_restock changes; everything else stays as it is.
-- Safe to run more than once.
-- =====================================================================

create or replace function public.log_receipt_restock()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_old       numeric;
  v_new       numeric;
  v_cost      numeric;
  v_ref       text;
  v_percent   numeric;
  v_suggested numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    return new;
  end if;

  v_old  := nullif(to_jsonb(old)->>'quantity', '')::numeric;
  v_new  := nullif(to_jsonb(new)->>'quantity', '')::numeric;

  -- 1. the cost the scanner sent
  v_cost := new.last_cost;

  -- 2. the price it sent: a receipt's unit cost
  if v_cost is null and new.price is distinct from old.price and new.price > 0.01 then
    v_cost := new.price;
  end if;

  -- the cost is used once, then emptied
  new.last_cost := null;

  if v_new is null or v_old is null or v_new <= v_old then
    return new;
  end if;

  -- 3. the cost from this product's latest receipt
  if v_cost is null then
    select i.cost
      into v_cost
      from public.receipt_review_items i
     where i.product_id = to_jsonb(new)->>'id'
       and i.cost > 0.01
     order by i.created_at desc, i.id desc
     limit 1;
  end if;

  select upload_ref, percent
    into v_ref, v_percent
    from public.receipt_markups
   where created_at > now() - interval '15 minutes'
   order by created_at desc
   limit 1;

  if v_percent is not null and v_cost is not null and v_cost > 0.01 then
    v_suggested := round(v_cost * (1 + v_percent / 100), 2);
  else
    v_suggested := old.price;
  end if;

  insert into public.receipt_review_items
    (upload_ref, product_id, product_name, is_new, qty_added, cost, percent, price, stock_applied)
  values
    (v_ref,
     to_jsonb(new)->>'id',
     to_jsonb(new)->>'name',
     false,
     v_new - v_old,
     v_cost,
     v_percent,
     v_suggested,
     false);

  -- stock and price stay as they were until the owner confirms
  new.quantity := old.quantity;
  new.price := old.price;

  return new;
end;
$function$;

-- Restocks already waiting without a cost: the cost from the product's
-- latest receipt, and (still held) their suggested price.
with known as (
  select i.id,
         (select j.cost
            from public.receipt_review_items j
           where j.product_id = i.product_id
             and j.cost > 0.01
           order by j.created_at desc, j.id desc
           limit 1) as cost
    from public.receipt_review_items i
   where i.status = 'pending'
     and i.cost is null
     and not i.is_new
     and i.product_id is not null
)
update public.receipt_review_items i
   set cost  = k.cost,
       price = case
                 when i.stock_applied is false and i.percent is not null
                   then round(k.cost * (1 + i.percent / 100), 2)
                 else i.price
               end
  from known k
 where k.id = i.id
   and k.cost is not null;
