-- =====================================================================
-- Supplier: "your receipt was confirmed" in the notification bell
-- ---------------------------------------------------------------------
-- The confirmations from 20261102000001 (products the owner added from a
-- supplier's receipt) now go to the supplier's notification bell and a
-- short pop-up instead of big banners on the page.
--
-- Each one is shown once: supplier_take_new_receipt_results() gives the
-- confirmations since the supplier last got them and marks them as seen.
-- The app keeps them in the bell until the supplier logs out; after that
-- they're gone (only new ones come next time).
--
-- Run 20261102000001_supplier_receipt_confirmation.sql first.
-- Safe to run more than once.
-- =====================================================================

begin;

-- up to when each supplier has been told
create table if not exists public.supplier_notice_marks (
  supplier_id uuid primary key references auth.users (id) on delete cascade,
  seen_until  timestamptz not null default now()
);

alter table public.supplier_notice_marks enable row level security;
revoke all on public.supplier_notice_marks from anon, authenticated;

-- The confirmations not shown yet (one row per receipt), then marks them
-- as seen. The first time: those of the last 3 days.
create or replace function public.supplier_take_new_receipt_results()
 returns table (
   upload_id    bigint,
   file_name    text,
   products     integer,
   pieces       numeric,
   confirmed_at timestamptz
 )
 language plpgsql
 volatile security definer
 set search_path to 'public'
as $function$
declare
  v_since timestamptz;
begin
  perform public.require_role(array['supplier']);

  select m.seen_until into v_since
  from public.supplier_notice_marks m
  where m.supplier_id = auth.uid();

  v_since := coalesce(v_since, now() - interval '3 days');

  return query
    select r.upload_id,
           su.file_name,
           count(*)::integer,
           sum(r.qty_added),
           max(r.confirmed_at)
      from public.supplier_list_receipt_results(1000) r
      join public.supplier_uploads su on su.id = r.upload_id
     group by r.upload_id, su.file_name
    having max(r.confirmed_at) > v_since
     order by 5 desc;

  insert into public.supplier_notice_marks as m (supplier_id, seen_until)
  values (auth.uid(), now())
  on conflict (supplier_id) do update set seen_until = excluded.seen_until;
end;
$function$;

revoke execute on function public.supplier_take_new_receipt_results() from public, anon;
grant execute on function public.supplier_take_new_receipt_results() to authenticated;

commit;
