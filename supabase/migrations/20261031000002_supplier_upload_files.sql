-- =====================================================================
-- Supplier page, My uploads: suppliers can see the receipts they uploaded
-- ---------------------------------------------------------------------
-- My uploads now shows each receipt's picture and a View button. For a
-- receipt that's still waiting (its file is in the supplierReceipt bucket)
-- the page needs to know where the file is, so supplier_list_my_uploads
-- also gives file_path. It's the supplier's own file: storage already lets
-- the supplier who uploaded it (and the owner) read it.
--
-- Also gives up to 500 uploads (as 20261031000001 does), so running only
-- this file is enough. Until it's run, the page works as before and only
-- receipts already sent to the scanner can be opened.
-- Safe to run more than once.
-- =====================================================================

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
    select su.id, su.file_name, su.file_path, su.status, su.created_at, su.forwarded_at,
           case
             when su.send_at is null then null
             else ceil(extract(epoch from su.send_at - now()))::integer
           end as seconds_to_send
      from supplier_uploads su
     where su.supplier_id = auth.uid()
     order by su.created_at desc
     limit least(greatest(coalesce(p_limit, 10), 1), 500)
  ) u;

  return v_rows;
end;
$function$;

revoke execute on function public.supplier_list_my_uploads(integer) from public, anon;
grant execute on function public.supplier_list_my_uploads(integer) to authenticated;
