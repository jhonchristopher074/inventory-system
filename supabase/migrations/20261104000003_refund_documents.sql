-- =====================================================================
-- Refunds in Documentation
-- ---------------------------------------------------------------------
-- Run after 20261104000001_refund_requests.sql.
-- Approval > Refunds keeps only the last days; Documentation > Refunded
-- lists every approved refund, for good (the record of money given back).
-- Safe to run more than once.
-- =====================================================================

create or replace function public.admin_list_refund_documents()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(public.refund_json(r) order by r.decided_at desc nulls last, r.id desc)
      from public.refund_requests r
     where r.status = 'approved'
  ), '[]'::jsonb);
end;
$function$;

revoke execute on function public.admin_list_refund_documents() from public, anon;
grant execute on function public.admin_list_refund_documents() to authenticated;
