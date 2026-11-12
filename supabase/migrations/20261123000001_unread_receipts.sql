-- =====================================================================
-- Approval: receipts the scanner didn't read come back
-- ---------------------------------------------------------------------
-- An approved receipt is copied to the "Approved Receipt" bucket and the
-- receipt scanner (n8n) reads its products into receipt_review_items.
-- When the scanner fails, nothing comes back and the receipt was lost from
-- view. Now Approval lists every receipt sent 10+ minutes ago with no
-- products from it ("Not read by the scanner"), with:
--   Send again  a new copy goes to the scanner (scan_tries counts them)
--   Remove      off the list (not a real receipt, or handled by hand)
--
-- New on supplier_uploads: scan_tries, scan_dismissed_at. Nothing else
-- changes. Safe to run more than once.
-- =====================================================================

begin;

alter table public.supplier_uploads add column if not exists scan_tries integer not null default 0;
alter table public.supplier_uploads add column if not exists scan_dismissed_at timestamptz;


-- sent to the scanner 10+ minutes ago (in the last 60 days), no products
-- from it yet, not removed from the list
create or replace function public.admin_list_unread_receipts()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['admin']);

  select coalesce(jsonb_agg(
           to_jsonb(su) || jsonb_build_object(
             'supplier_name', coalesce(nullif(btrim(su.supplier_name), ''), p.full_name),
             'supplier_email', p.email,
             'uploader_name', coalesce(nullif(btrim(p.full_name), ''), p.email),
             'uploader_role', coalesce(su.uploader_role, 'supplier'),
             -- the profit % it was sent with, for "Send again"
             'last_percent', (select m.percent from receipt_markups m
                               where m.upload_ref = su.id::text
                               order by m.created_at desc limit 1))
           order by su.forwarded_at desc), '[]'::jsonb)
    into v_rows
    from supplier_uploads su
    left join profiles p on p.id = su.supplier_id
   where su.status = 'approved'
     and su.forwarded_at is not null
     and su.forwarded_at < now() - interval '10 minutes'
     and su.forwarded_at > now() - interval '60 days'
     and su.scan_dismissed_at is null
     and not exists (select 1 from receipt_review_items i where i.upload_ref = su.id::text);

  return v_rows;
end;
$function$;


-- "Send again": the app has put a new copy in the bucket; count it and
-- start the 10 minutes over
create or replace function public.admin_mark_receipt_resent(p_upload_id bigint, p_try integer)
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
     set scan_tries = greatest(scan_tries, coalesce(p_try, scan_tries + 1)),
         forwarded_at = now()
   where id = p_upload_id
     and status = 'approved'
   returning * into v_row;

  if not found then
    raise exception 'That receipt is no longer approved.';
  end if;

  return jsonb_build_object('id', v_row.id, 'scan_tries', v_row.scan_tries);
end;
$function$;


-- "Remove": off the "Not read by the scanner" list
create or replace function public.admin_dismiss_unread_receipt(p_upload_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update supplier_uploads
     set scan_dismissed_at = now()
   where id = p_upload_id;

  return jsonb_build_object('id', p_upload_id, 'dismissed', true);
end;
$function$;


revoke all on function public.admin_list_unread_receipts() from public, anon;
revoke all on function public.admin_mark_receipt_resent(bigint, integer) from public, anon;
revoke all on function public.admin_dismiss_unread_receipt(bigint) from public, anon;
grant execute on function public.admin_list_unread_receipts() to authenticated;
grant execute on function public.admin_mark_receipt_resent(bigint, integer) to authenticated;
grant execute on function public.admin_dismiss_unread_receipt(bigint) to authenticated;

commit;

-- check: the receipts the scanner didn't read
-- select id, file_name, forwarded_at, scan_tries from supplier_uploads
--  where status = 'approved' and forwarded_at < now() - interval '10 minutes'
--    and scan_dismissed_at is null
--    and not exists (select 1 from receipt_review_items i where i.upload_ref = supplier_uploads.id::text);
