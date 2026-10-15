-- =====================================================================
-- 2026-10-15
--
-- 1. "Mine" is decided by user ID instead of by name.
--    Staff drafts, inspections and documents were matched by display
--    name: renaming yourself turned your own work into "someone else's",
--    and two staff with the same name could change each other's work.
--    Each row now stores the user's ID. Existing rows get an ID by name
--    where that name belongs to exactly one person; rows that can't be
--    matched keep working by name, as before.
--
-- 2. Supplier receipts that were approved but never reached the
--    "Approved Receipt" bucket (so n8n never got them) are now tracked
--    (forwarded_at) and can be sent again from the Approval page.
--
-- 3. New functions are no longer callable by everyone by default.
--    (The line meant for this in the first lock-down file didn't cover
--    PUBLIC. Nothing was exposed: no new function was added since.)
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Ownership by user ID
-- ---------------------------------------------------------------------

alter table public.documentations
  add column if not exists created_by_id uuid references public.profiles(id) on delete set null;

alter table public.inspection_approvals
  add column if not exists requested_by_id uuid references public.profiles(id) on delete set null;

-- Existing rows: find the person by the saved name, but only when exactly
-- one person has that name.
with person as (
  select coalesce(nullif(trim(full_name), ''), email) as display_name,
         (array_agg(id))[1] as id,
         count(*) as people
  from public.profiles
  group by 1
)
update public.documentations d
   set created_by_id = person.id
  from person
 where d.created_by_id is null
   and person.people = 1
   and person.display_name = trim(d.created_by);

with person as (
  select coalesce(nullif(trim(full_name), ''), email) as display_name,
         (array_agg(id))[1] as id,
         count(*) as people
  from public.profiles
  group by 1
)
update public.inspection_approvals a
   set requested_by_id = person.id
  from person
 where a.requested_by_id is null
   and person.people = 1
   and person.display_name = trim(a.requested_by);

-- Is this row the logged-in user's? By ID; rows without an ID (older ones
-- that couldn't be matched) fall back to the name.
create or replace function public.owned_by_me(p_owner_id uuid, p_owner_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    case
      when p_owner_id is not null then p_owner_id = auth.uid()
      else p_owner_name = public.my_display_name()
    end,
    false
  );
$function$;

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

  -- p_created_by is ignored: the author is the logged-in user
  insert into documentations (
    title, type, description, product_id, product_name,
    created_by, created_by_id, receipt_image_url
  )
  values (
    trim(p_title), p_type, p_description, p_product_id, p_product_name,
    public.my_display_name(), auth.uid(), p_image_url
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
    and public.owned_by_me(created_by_id, created_by)
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
    and public.owned_by_me(created_by_id, created_by);

  if not found then
    raise exception 'Document % not found', p_document_id;
  end if;

  return jsonb_build_object('deleted', p_document_id);
end;
$function$;

-- Before, anyone logged in could list anyone's documents by typing a name.
create or replace function public.list_documentations_by_author(p_created_by text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_auth();

  -- p_created_by is ignored: you always get your own documents
  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into v_rows
  from (
    select * from documentations
    where public.owned_by_me(created_by_id, created_by)
    order by created_at desc
  ) d;

  return v_rows;
end;
$function$;

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

  insert into documentations (product_id, product_name, type, description, receipt_image_url, created_by, created_by_id)
  values (
    p_product_id,
    p_product_name,
    'Product Report',
    format('Reported by %s. Issue: %s. Details: %s',
      v_me, p_report_type, trim(p_description)),
    p_image_url,
    v_me,
    auth.uid()
  );

  return jsonb_build_object('notification_id', v_notification_id, 'product_id', p_product_id);
end;
$function$;

-- The automatic "Inspection Result" document belongs to the staff member
-- who did the inspection. Unchanged apart from created_by_id.
create or replace function public.document_inspection_approval(p_approval_id bigint)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  a public.inspection_approvals%rowtype;
  p public.products%rowtype;
  v_approved integer;
  v_return integer;
  v_result text;
begin
  select * into a from public.inspection_approvals where id = p_approval_id;

  if not found then
    raise exception 'Approval % not found.', p_approval_id;
  end if;

  if exists (select 1 from public.documentations where approval_id = a.id) then
    return; -- already documented
  end if;

  select * into p from public.products where id = a.product_id;

  v_approved := coalesce(a.approved_qty, 0);
  v_return   := coalesce(a.return_qty, 0);

  v_result := case
    when v_return = 0 then 'Approved'
    when v_approved = 0 then 'Return'
    else 'Approved with returns'
  end;

  insert into public.documentations (
    approval_id, type, title, description,
    product_id, product_name, receipt_image_url, image_url, created_by, created_by_id
  )
  values (
    a.id,
    'Inspection Document',
    'Inspection Result - ' || coalesce(a.product_name, p.name, 'Product'),
    format(
      E'%s was inspected and approved on %s.\nResult: %s\nApproved: %s\nReturn: %s\nTotal inspected: %s\nInspected by: %s\nCategory: %s',
      coalesce(a.product_name, p.name, 'Product'),
      to_char(now() at time zone 'Asia/Manila', 'FMMonth FMDD, YYYY'),
      v_result,
      v_approved,
      v_return,
      v_approved + v_return,
      coalesce(nullif(trim(a.requested_by), ''), 'Staff'),
      coalesce(nullif(trim(p.category), ''), 'Uncategorized')
    ),
    a.product_id,
    coalesce(a.product_name, p.name),
    p.image_url,   -- same column the older inspection documents use for the picture
    p.image_url,
    a.requested_by,
    a.requested_by_id
  );
end;
$function$;

create or replace function public.save_inspection_draft(p_approval_id bigint, p_product_id bigint, p_product_name text, p_approved_qty integer, p_return_qty integer, p_requested_by text)
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

  v_total := coalesce(p_approved_qty, 0) + coalesce(p_return_qty, 0);

  if v_total <= 0 then
    raise exception 'Enter approved or return quantity first.';
  end if;

  -- p_requested_by is ignored: the owner is the logged-in user
  if p_approval_id is null then
    insert into inspection_approvals (
      product_id, product_name, approved_qty, return_qty, status,
      requested_by, requested_by_id
    )
    values (
      p_product_id, p_product_name,
      coalesce(p_approved_qty, 0), coalesce(p_return_qty, 0),
      'saved', public.my_display_name(), auth.uid()
    )
    returning * into v_approval;
  else
    update inspection_approvals
    set approved_qty    = coalesce(p_approved_qty, 0),
        return_qty      = coalesce(p_return_qty, 0),
        requested_by_id = coalesce(requested_by_id, auth.uid()),
        status          = 'saved'
    where id = p_approval_id
      and status = 'saved'
      and public.owned_by_me(requested_by_id, requested_by)
    returning * into v_approval;

    if not found then
      raise exception 'Saved inspection % not found (it may already be submitted, or belong to someone else)', p_approval_id;
    end if;
  end if;

  return to_jsonb(v_approval);
end;
$function$;

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
    and public.owned_by_me(requested_by_id, requested_by)
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
    and public.owned_by_me(requested_by_id, requested_by);

  if not found then
    raise exception 'Saved inspection % not found (it may already be submitted, or belong to someone else)', p_approval_id;
  end if;

  return jsonb_build_object('deleted', p_approval_id);
end;
$function$;

-- ---------------------------------------------------------------------
-- 2. Approved supplier receipts that never reached n8n
-- ---------------------------------------------------------------------

-- Set once the receipt has been copied into the "Approved Receipt" bucket.
alter table public.supplier_uploads
  add column if not exists forwarded_at timestamptz;

-- Uploads approved before today are assumed sent, so an old receipt can't
-- be sent to n8n a second time by mistake (that would add its stock again).
-- Only failures from now on are listed for retry.
update public.supplier_uploads
   set forwarded_at = coalesce(reviewed_at, now())
 where status = 'approved'
   and forwarded_at is null;

create or replace function public.admin_mark_supplier_upload_forwarded(p_upload_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row supplier_uploads%rowtype;
begin
  perform public.require_role(array['admin']);

  update supplier_uploads
     set forwarded_at = coalesce(forwarded_at, now())
   where id = p_upload_id
     and status = 'approved'
  returning * into v_row;

  if not found then
    raise exception 'Approved upload % not found', p_upload_id;
  end if;

  return to_jsonb(v_row);
end;
$function$;

create or replace function public.admin_list_unsent_supplier_uploads()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(to_jsonb(u) order by u.reviewed_at desc nulls last), '[]'::jsonb)
    into v_rows
  from (
    select su.*, p.full_name as supplier_name, p.email as supplier_email
    from supplier_uploads su
    left join profiles p on p.id = su.supplier_id
    where su.status = 'approved'
      and su.forwarded_at is null
  ) u;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- 3. Who can call the new functions
-- ---------------------------------------------------------------------

-- internal helper: only used inside other functions
revoke execute on function public.owned_by_me(uuid, text) from public, anon, authenticated;

revoke execute on function public.admin_mark_supplier_upload_forwarded(bigint) from public, anon;
revoke execute on function public.admin_list_unsent_supplier_uploads() from public, anon;

grant execute on function
  public.admin_mark_supplier_upload_forwarded(bigint),
  public.admin_list_unsent_supplier_uploads()
to authenticated;

-- From now on, new functions are not callable by PUBLIC (which includes
-- logged-out visitors) unless granted on purpose.
alter default privileges revoke execute on functions from public;

commit;
