-- =====================================================================
-- Inspection fixes (2026-10-14)
--
-- 1. Approved RETURNS now come out of stock. Before, approving
--    "Return: 38" on a 263 product left the stock at 263.
--
-- 2. Each inspection remembers its batch size (inspection_qty) when it
--    is scheduled, and all inspection math uses that number instead of
--    the live stock. Before, selling items while an inspection was
--    waiting made it impossible to approve ("cannot exceed product
--    quantity"), and returns would have broken the "remaining" count.
--
-- 3. Rescheduling an inspection no longer silently deletes inspections
--    staff already SUBMITTED. It now stops with a message until the admin
--    approves or rejects them. (Unsubmitted drafts for the old schedule
--    are still cleared, and approval history is now kept.)
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

alter table public.products
  add column if not exists inspection_qty integer;

-- Inspections already in progress: the batch is the current stock.
update public.products
   set inspection_qty = quantity
 where inspection_date is not null
   and inspection_qty is null;

create or replace function public.schedule_inspection(p_product_id bigint, p_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_product products%rowtype;
  v_waiting integer;
begin
  perform public.require_role(array['admin']);

  select count(*) into v_waiting
  from inspection_approvals
  where product_id = p_product_id
    and status = 'submitted';

  if v_waiting > 0 then
    raise exception 'This product has % inspection(s) waiting in Approval. Approve or reject them before rescheduling.', v_waiting;
  end if;

  update products
  set inspection_date = p_date,
      inspection_qty = quantity,     -- the batch to inspect
      approved_count = 0,
      return_count = 0,
      inspection_result = null
  where id = p_product_id
  returning * into v_product;

  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  -- drafts for the old schedule no longer apply
  delete from inspection_approvals
  where product_id = p_product_id
    and status = 'saved';

  perform public.notify(
    'Inspection Scheduled',
    format('%s is scheduled for inspection.', v_product.name),
    'inspection',
    p_product_id
  );

  return to_jsonb(v_product);
end;
$function$;

-- Only moves the date; keeps the batch if one was already set.
create or replace function public.set_inspection_date(p_product_id bigint, p_date date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_product products%rowtype;
begin
  perform public.require_role(array['admin']);

  update products
  set inspection_date = p_date,
      inspection_qty = coalesce(inspection_qty, quantity)
  where id = p_product_id returning * into v_product;

  if not found then
    raise exception 'Product % not found', p_product_id;
  end if;

  perform public.notify(
    'Inspection Date Set',
    format('%s inspection date was set.', v_product.name),
    'inspection',
    p_product_id
  );

  return to_jsonb(v_product);
end;
$function$;

create or replace function public.approve_inspection(p_approval_id bigint, p_approved_qty integer, p_return_qty integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_approval     inspection_approvals%rowtype;
  v_product      products%rowtype;
  v_approved     integer := coalesce(p_approved_qty, 0);
  v_return       integer := coalesce(p_return_qty, 0);
  v_new_approved integer;
  v_new_return   integer;
  v_batch        integer;
begin
  perform public.require_role(array['admin']);

  if v_approved < 0 or v_return < 0 then
    raise exception 'Quantities cannot be negative.';
  end if;

  select * into v_approval from inspection_approvals where id = p_approval_id for update;

  if not found then
    raise exception 'Approval % not found', p_approval_id;
  end if;

  if v_approval.status is distinct from 'submitted' then
    raise exception 'This inspection was already reviewed.';
  end if;

  select * into v_product from products where id = v_approval.product_id for update;

  if not found then
    raise exception 'Product % not found', v_approval.product_id;
  end if;

  v_new_approved := coalesce(v_product.approved_count, 0) + v_approved;
  v_new_return   := coalesce(v_product.return_count, 0) + v_return;
  v_batch        := coalesce(v_product.inspection_qty, v_product.quantity, 0);

  if v_new_approved + v_new_return > v_batch then
    raise exception 'Approved + Return cannot exceed the % item(s) scheduled for inspection.', v_batch;
  end if;

  if v_return > coalesce(v_product.quantity, 0) then
    raise exception 'Cannot return % item(s): only % left in stock.', v_return, coalesce(v_product.quantity, 0);
  end if;

  -- returned items go back to the supplier, so they leave the stock
  update products
  set approved_count = v_new_approved,
      return_count = v_new_return,
      quantity = quantity - v_return,
      inspection_result = case when v_new_return > 0 then 'return' else 'approved' end
  where id = v_product.id;

  update inspection_approvals set status = 'approved' where id = p_approval_id;

  perform public.notify(
    'Inspection Approved',
    case when v_return > 0
      then format('%s inspection was approved by admin. %s item(s) returned and removed from stock.',
             v_approval.product_name, v_return)
      else format('%s inspection was approved by admin.', v_approval.product_name)
    end,
    'inspection',
    v_approval.product_id
  );

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'product_id', v_product.id,
    'approved_count', v_new_approved,
    'return_count', v_new_return
  );
end;
$function$;

commit;
