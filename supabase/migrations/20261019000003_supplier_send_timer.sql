-- =====================================================================
-- Suppliers see when their approved receipt goes to the receipt scanner
-- ---------------------------------------------------------------------
-- Approved receipts are sent to the scanner (n8n) one at a time, about
-- 90 seconds apart, from the admin's Approval page. That page now saves
-- when each receipt in line will be sent (send_at), and the supplier's
-- page shows a countdown to it, then "Sent to the scanner".
--
-- Safe to run more than once.
-- =====================================================================

alter table public.supplier_uploads
  add column if not exists send_at timestamptz;

-- Approval page: p_schedule = [{ "id": 12, "seconds": 90 }, ...]
-- seconds = how long until that receipt is sent; null = no longer in line.
-- Only approved receipts that weren't sent yet are touched.
create or replace function public.admin_schedule_supplier_uploads(p_schedule jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_role(array['admin']);

  update supplier_uploads su
     set send_at = case
           when s.seconds is null then null
           else now() + greatest(0, least(s.seconds, 86400))::double precision * interval '1 second'
         end
    from jsonb_to_recordset(coalesce(p_schedule, '[]'::jsonb)) as s(id bigint, seconds numeric)
   where su.id = s.id
     and su.status = 'approved'
     and su.forwarded_at is null;
end;
$function$;

-- Supplier page: their own newest uploads with the time left until each is
-- sent. The database counts the seconds, so a phone with a wrong clock
-- still shows the right countdown. Negative = the send time has passed.
create or replace function public.supplier_list_my_uploads(p_limit integer default 10)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_role(array['supplier']);

  select coalesce(jsonb_agg(to_jsonb(u) order by u.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select su.id, su.file_name, su.status, su.created_at, su.forwarded_at,
           case
             when su.send_at is null then null
             else ceil(extract(epoch from su.send_at - now()))::integer
           end as seconds_to_send
      from supplier_uploads su
     where su.supplier_id = auth.uid()
     order by su.created_at desc
     limit least(greatest(coalesce(p_limit, 10), 1), 50)
  ) u;

  return v_rows;
end;
$function$;

revoke execute on function public.admin_schedule_supplier_uploads(jsonb) from public, anon;
revoke execute on function public.supplier_list_my_uploads(integer) from public, anon;

grant execute on function
  public.admin_schedule_supplier_uploads(jsonb),
  public.supplier_list_my_uploads(integer)
to authenticated;
