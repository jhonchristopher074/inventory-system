-- =====================================================================
-- Security fixes from the 2026-10-14 review.
--
-- Run the whole file at once in Supabase > SQL Editor.
-- It is one transaction: if any statement fails, NOTHING is changed.
--
-- What it fixes:
--   1. Functions anyone could call without logging in
--      (e.g. set_product_quantity, soft_delete_product, notify).
--   2. Table policies that let any logged-in user (cashier, supplier...)
--      read or edit tables directly and skip the functions' checks.
--   3. Inspection approvals that could be re-submitted / approved twice.
--   4. Names ("created by", "requested by", cashier name) being taken from
--      the browser instead of the logged-in user's profile.
--   5. Staff changing or deleting other staff members' drafts/documents.
--
-- The app's screens don't need any change for this file: every function
-- keeps the same name and parameters.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

-- A disabled admin is no longer treated as admin.
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
      and coalesce(is_active, true)
  );
$function$;

-- The logged-in user's name, read on the server. Same value the app
-- shows: full name, or email when there is no name.
create or replace function public.my_display_name()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(nullif(trim(full_name), ''), email)
  from profiles
  where id = auth.uid();
$function$;

-- Users could hide/unhide themselves or change their account number.
create or replace function public.protect_profile_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an admin can change a user''s role.';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Only an admin can activate or deactivate a user.';
    end if;
    if new.is_hidden is distinct from old.is_hidden then
      raise exception 'Only an admin can hide or unhide a user.';
    end if;
    if new.account_no is distinct from old.account_no then
      raise exception 'Only an admin can change an account number.';
    end if;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------
-- Products: these had NO permission check at all
-- ---------------------------------------------------------------------

create or replace function public.restore_product(p_product_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update public.products
     set is_archived = false
   where id = p_product_id
     and is_archived = true
     and is_deleted = false;

  if not found then
    raise exception 'Product not found in the archive.';
  end if;
end;
$function$;

create or replace function public.soft_delete_product(p_product_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update public.products
     set is_deleted = true,
         deleted_at = now()
   where id = p_product_id
     and is_archived = true
     and is_deleted = false;

  if not found then
    raise exception 'Product not found in the archive.';
  end if;
end;
$function$;

create or replace function public.set_product_quantity(p_product_id bigint, p_quantity integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  if p_quantity is null or p_quantity < 0 then
    raise exception 'Quantity must be 0 or more.';
  end if;

  update public.products
     set quantity = p_quantity
   where id = p_product_id;

  if not found then
    raise exception 'Product not found.';
  end if;
end;
$function$;

create or replace function public.list_deleted_product_ids()
 returns table(id bigint)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id from public.products p
  where p.is_deleted = true
    and public.is_admin();
$function$;

-- Archived screen (admin) uses this too, but it only allowed staff.
create or replace function public.submit_product_report(p_product_id bigint, p_product_name text, p_report_type text, p_description text, p_reported_by text, p_image_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_notification_id bigint;
  v_me text;
begin
  perform public.require_role(array['admin', 'staff']);

  -- p_reported_by is ignored: the name comes from the logged-in profile
  v_me := coalesce(public.my_display_name(), 'Staff');

  if p_description is null or trim(p_description) = '' then
    raise exception 'Report description is required';
  end if;

  v_notification_id := public.notify(
    format('Product Report: %s', p_report_type),
    format('%s - %s', p_product_name, trim(p_description)),
    'report',
    p_product_id,
    '/inventory'
  );

  insert into documentations (product_id, product_name, type, description, receipt_image_url, created_by)
  values (
    p_product_id,
    p_product_name,
    'Product Report',
    format('Reported by %s. Issue: %s. Details: %s',
      v_me, p_report_type, trim(p_description)),
    p_image_url,
    v_me
  );

  return jsonb_build_object('notification_id', v_notification_id, 'product_id', p_product_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------

create or replace function public.mark_delivery_done(p_delivery_id bigint, p_done_by text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin', 'staff']);

  -- p_done_by is ignored: the name comes from the logged-in profile
  update public.deliveries
     set status = 'Delivered',
         delivered_at = now(),
         delivered_by = public.my_display_name()
   where id = p_delivery_id
     and coalesce(status, 'Scheduled') <> 'Delivered';

  if not found then
    raise exception 'Delivery not found or already marked as delivered.';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------

create or replace function public.save_inspection_draft(p_approval_id bigint, p_product_id bigint, p_product_name text, p_approved_qty integer, p_return_qty integer, p_requested_by text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_approval inspection_approvals%rowtype;
  v_total    integer;
  v_me       text;
begin
  perform public.require_role(array['staff']);

  -- p_requested_by is ignored: the name comes from the logged-in profile
  v_me := public.my_display_name();

  v_total := coalesce(p_approved_qty, 0) + coalesce(p_return_qty, 0);

  if v_total <= 0 then
    raise exception 'Enter approved or return quantity first.';
  end if;

  if p_approval_id is null then
    insert into inspection_approvals (
      product_id, product_name, approved_qty, return_qty, status, requested_by
    )
    values (
      p_product_id, p_product_name,
      coalesce(p_approved_qty, 0), coalesce(p_return_qty, 0),
      'saved', v_me
    )
    returning * into v_approval;
  else
    update inspection_approvals
    set approved_qty = coalesce(p_approved_qty, 0),
        return_qty   = coalesce(p_return_qty, 0),
        status       = 'saved'
    where id = p_approval_id
      and status = 'saved'
      and requested_by = v_me
    returning * into v_approval;

    if not found then
      raise exception 'Saved inspection % not found (it may already be submitted, or belong to someone else)', p_approval_id;
    end if;
  end if;

  return to_jsonb(v_approval);
end;
$function$;

-- Only your own SAVED drafts can be submitted. Before, an approved or
-- rejected one could be submitted again and counted twice.
create or replace function public.submit_inspection_approval(p_approval_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_approval inspection_approvals%rowtype;
  v_total    integer;
begin
  perform public.require_role(array['staff']);

  update inspection_approvals set status = 'submitted'
  where id = p_approval_id
    and status = 'saved'
    and requested_by = public.my_display_name()
  returning * into v_approval;

  if not found then
    raise exception 'Saved inspection % not found (it may already be submitted, or belong to someone else)', p_approval_id;
  end if;

  v_total := coalesce(v_approval.approved_qty, 0) + coalesce(v_approval.return_qty, 0);

  perform public.notify(
    'Inspection Approval Request',
    format('%s has %s item(s) waiting for admin approval.', v_approval.product_name, v_total),
    'inspection_approval',
    v_approval.product_id
  );

  return to_jsonb(v_approval);
end;
$function$;

create or replace function public.delete_inspection_draft(p_approval_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['staff']);

  delete from inspection_approvals
  where id = p_approval_id
    and status = 'saved'
    and requested_by = public.my_display_name();

  if not found then
    raise exception 'Saved inspection % not found (it may already be submitted, or belong to someone else)', p_approval_id;
  end if;

  return jsonb_build_object('deleted', p_approval_id);
end;
$function$;

-- Only SUBMITTED approvals can be approved. Before, a double-click (or a
-- re-submitted one) added the quantities to the product twice.
create or replace function public.approve_inspection(p_approval_id bigint, p_approved_qty integer, p_return_qty integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_approval     inspection_approvals%rowtype;
  v_product      products%rowtype;
  v_new_approved integer;
  v_new_return   integer;
begin
  perform public.require_role(array['admin']);

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

  v_new_approved := coalesce(v_product.approved_count, 0) + coalesce(p_approved_qty, 0);
  v_new_return   := coalesce(v_product.return_count, 0) + coalesce(p_return_qty, 0);

  if v_new_approved + v_new_return > coalesce(v_product.quantity, 0) then
    raise exception 'Approved + Return cannot exceed product quantity';
  end if;

  update products
  set approved_count = v_new_approved,
      return_count = v_new_return,
      inspection_result = case when v_new_return > 0 then 'return' else 'approved' end
  where id = v_product.id;

  update inspection_approvals set status = 'approved' where id = p_approval_id;

  perform public.notify(
    'Inspection Approved',
    format('%s inspection was approved by admin.', v_approval.product_name),
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

create or replace function public.reject_inspection(p_approval_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_approval inspection_approvals%rowtype;
begin
  perform public.require_role(array['admin']);

  update inspection_approvals set status = 'rejected'
  where id = p_approval_id
    and status = 'submitted'
  returning * into v_approval;

  if not found then
    raise exception 'Approval % not found or already reviewed', p_approval_id;
  end if;

  perform public.notify(
    'Inspection Rejected',
    format('%s inspection was rejected by admin.', v_approval.product_name),
    'inspection',
    v_approval.product_id
  );

  return jsonb_build_object('approval_id', p_approval_id, 'status', 'rejected');
end;
$function$;

-- ---------------------------------------------------------------------
-- Documentation: author comes from the profile; staff can only change
-- their own documents
-- ---------------------------------------------------------------------

create or replace function public.create_documentation(p_title text, p_type text, p_description text, p_product_id bigint, p_product_name text, p_created_by text, p_image_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_doc documentations%rowtype;
begin
  perform public.require_role(array['staff']);

  if p_title is null or trim(p_title) = '' then
    raise exception 'Please enter title.';
  end if;

  -- p_created_by is ignored: the name comes from the logged-in profile
  insert into documentations (
    title, type, description, product_id, product_name,
    created_by, receipt_image_url
  )
  values (
    trim(p_title), p_type, p_description, p_product_id, p_product_name,
    public.my_display_name(), p_image_url
  )
  returning * into v_doc;

  return to_jsonb(v_doc);
end;
$function$;

create or replace function public.update_documentation_photo(p_document_id bigint, p_image_url text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_doc documentations%rowtype;
begin
  perform public.require_role(array['staff']);

  update documentations
  set receipt_image_url = p_image_url
  where id = p_document_id
    and created_by = public.my_display_name()
  returning * into v_doc;

  if not found then
    raise exception 'Document % not found', p_document_id;
  end if;

  return to_jsonb(v_doc);
end;
$function$;

create or replace function public.delete_documentation(p_document_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['staff']);

  delete from documentations
  where id = p_document_id
    and created_by = public.my_display_name();

  if not found then
    raise exception 'Document % not found', p_document_id;
  end if;

  return jsonb_build_object('deleted', p_document_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- Sales: cashier name/email come from the profile, not the browser.
-- Everything else is unchanged.
-- ---------------------------------------------------------------------

create or replace function public.process_sale(p_cashier_id uuid, p_cashier_name text, p_cashier_email text, p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sale_id    bigint;
  v_total      numeric := 0;
  v_item       jsonb;
  v_product    products%rowtype;
  v_qty        integer;
  v_subtotal   numeric;
  v_sale_items jsonb := '[]'::jsonb;
  v_name       text;
  v_email      text;
begin
  perform public.require_role(array['cashier', 'admin']);

  if p_cashier_id is distinct from auth.uid() then
    raise exception 'Cannot record a sale for another user';
  end if;

  -- p_cashier_name / p_cashier_email are ignored
  select coalesce(nullif(trim(full_name), ''), email), email
    into v_name, v_email
    from profiles
   where id = auth.uid();

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) as t(value)
    order by (value->>'product_id')::bigint
  loop
    v_qty := (v_item->>'quantity')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception 'Invalid quantity for product %', v_item->>'product_id';
    end if;

    select * into v_product
    from products
    where id = (v_item->>'product_id')::bigint
      and is_archived = false
      and is_deleted = false
    for update;

    if not found then
      raise exception 'Product % not found or unavailable', v_item->>'product_id';
    end if;

    if v_product.quantity < v_qty then
      raise exception 'Insufficient stock for "%": requested %, available %',
        v_product.name, v_qty, v_product.quantity;
    end if;

    v_subtotal := v_product.price * v_qty;
    v_total := v_total + v_subtotal;

    v_sale_items := v_sale_items || jsonb_build_object(
      'product_id',   v_product.id,
      'product_name', v_product.name,
      'quantity',     v_qty,
      'price',        v_product.price,
      'subtotal',     v_subtotal
    );
  end loop;

  insert into sales (cashier_id, cashier_name, cashier_email, total_amount)
  values (p_cashier_id, v_name, v_email, v_total)
  returning id into v_sale_id;

  insert into sale_items (sale_id, product_id, product_name, quantity, price, subtotal)
  select
    v_sale_id,
    (elem->>'product_id')::bigint,
    elem->>'product_name',
    (elem->>'quantity')::integer,
    (elem->>'price')::numeric,
    (elem->>'subtotal')::numeric
  from jsonb_array_elements(v_sale_items) elem;

  -- stock deduction here is what fires the low-stock trigger
  update products p
  set quantity = p.quantity - (elem->>'quantity')::integer
  from jsonb_array_elements(v_sale_items) elem
  where p.id = (elem->>'product_id')::bigint;

  perform public.notify(
    'New Sale Completed',
    format('%s completed sale #%s worth ₱%s.',
      coalesce(v_name, 'A cashier'), v_sale_id,
      to_char(v_total, 'FM999,999,990.00')),
    'sale'
  );

  return jsonb_build_object(
    'id',            v_sale_id,
    'cashier_id',    p_cashier_id,
    'cashier_name',  v_name,
    'cashier_email', v_email,
    'total_amount',  v_total,
    'items',         v_sale_items
  );
end;
$function$;

-- ---------------------------------------------------------------------
-- Notifications: can only mark your own role's notifications as read
-- ---------------------------------------------------------------------

create or replace function public.mark_notification_read(p_notification_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_auth();

  update notifications set is_read = true
  where id = p_notification_id
    and (recipient_role is null or recipient_role = public.current_role());

  return jsonb_build_object('id', p_notification_id, 'is_read', true);
end;
$function$;

-- ---------------------------------------------------------------------
-- Table policies
-- The app only uses functions (never edits tables directly), so the
-- "allow everything" policies are removed. The functions still work:
-- they run as the table owner and are not limited by these policies.
-- SELECT policies that remain are what realtime needs.
-- ---------------------------------------------------------------------

drop policy if exists "Allow all deliveries" on public.deliveries;
drop policy if exists "documentations_authenticated_all" on public.documentations;
drop policy if exists "Allow all inspection approvals" on public.inspection_approvals;

drop policy if exists "notifications_insert_authenticated" on public.notifications;
drop policy if exists "notifications_update_authenticated" on public.notifications;
drop policy if exists "notifications_select_authenticated" on public.notifications;
create policy "notifications_select_my_role" on public.notifications
  for select to authenticated
  using (recipient_role is null or recipient_role = public.get_my_role());

-- every logged-in user (even suppliers) could read every sale
drop policy if exists "sales_select_authenticated" on public.sales;
create policy "sales_select_own_or_admin" on public.sales
  for select to authenticated
  using (cashier_id = auth.uid() or public.is_admin());

drop policy if exists "sale_items_select_authenticated" on public.sale_items;
create policy "sale_items_select_own_or_admin" on public.sale_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.sales s
      where s.id = sale_items.sale_id and s.cashier_id = auth.uid()
    )
  );

-- a supplier could approve their own upload or read/delete everyone's
alter table public.supplier_uploads enable row level security;
drop policy if exists "supplier_uploads_all_authenticated" on public.supplier_uploads;
create policy "supplier_uploads_select_own_or_admin" on public.supplier_uploads
  for select to authenticated
  using (supplier_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- Who can call functions (done last, after all functions exist)
-- Before: almost everything could be called without logging in.
-- After: only logged-in users, and only the functions the app uses.
-- Internal helpers (notify, require_role, trigger functions...) still
-- work inside other functions; they just can't be called from outside.
-- Old functions the app no longer uses (admin_update_user_password,
-- admin_create_profile, admin_update_user_role, admin_toggle_user_active,
-- admin_update_user, admin_toggle_user_hidden, archive_action) are
-- locked too. Edge Functions use the service role and are not affected.
-- ---------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- functions created later start locked as well
alter default privileges in schema public revoke execute on functions from public, anon;

grant execute on function
  -- used inside table/storage policies
  public.is_admin,
  public.get_my_role,

  -- account
  public.get_my_profile,
  public.update_my_name,
  public.update_my_avatar,
  public.admin_list_users,

  -- products
  public.list_products,
  public.list_product_nicknames,
  public.list_deleted_product_ids,
  public.add_product,
  public.add_stock,
  public.update_product,
  public.set_product_quantity,
  public.set_inspection_date,
  public.schedule_inspection,
  public.confirm_archive,
  public.restore_product,
  public.soft_delete_product,
  public.report_product_for_checking,
  public.submit_product_report,

  -- deliveries
  public.list_deliveries,
  public.create_delivery,
  public.mark_delivery_done,

  -- inspections
  public.list_active_approvals,
  public.list_submitted_approvals,
  public.save_inspection_draft,
  public.submit_inspection_approval,
  public.delete_inspection_draft,
  public.approve_inspection,
  public.reject_inspection,
  public.create_overdue_notification,

  -- documentation
  public.list_documentations,
  public.list_documentations_by_author,
  public.create_documentation,
  public.update_documentation_photo,
  public.delete_documentation,

  -- sales
  public.process_sale,
  public.list_my_sales,
  public.list_my_sales_since,
  public.list_all_sales,

  -- notifications
  public.list_notifications,
  public.mark_notification_read,
  public.mark_all_notifications_read,
  public.unread_notification_count,

  -- supplier uploads
  public.supplier_submit_upload,
  public.admin_list_supplier_uploads,
  public.admin_approve_supplier_upload,
  public.admin_reject_supplier_upload
to authenticated;

commit;
