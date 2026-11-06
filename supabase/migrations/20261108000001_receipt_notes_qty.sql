-- =====================================================================
-- Check prices: the staff's notes, and quantities the owner can fix
-- ---------------------------------------------------------------------
-- Run after 20261107000001_delivery_receipts.sql.
--
-- Some goods come faulty and go back to the supplier, so the receipt says
-- more than what really stays. In Check prices the owner now sees:
--   - the note written with the receipt upload (staff / supplier), and the
--     staff's notes from receiving it (admin_receipt_notes)
--   - a quantity box per product, while nothing is in stock yet: the
--     number saved with admin_set_review_qty is what Confirm adds
--     (0 = that product isn't added).
--
-- Until this is run, the window looks as before (no notes, no boxes).
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- The notes that came with one receipt (receipt_review_items.upload_ref)
-- ---------------------------------------------------------------------
create or replace function public.admin_receipt_notes(p_ref text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_upload    jsonb;
  v_receiving jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  if p_ref is null or p_ref !~ '^[0-9]+$' then
    return jsonb_build_object('upload', null, 'receiving', null);
  end if;

  -- written with the upload
  select jsonb_build_object(
           'note', nullif(btrim(su.note), ''),
           'by', coalesce(nullif(btrim(p.full_name), ''), p.email),
           'role', coalesce(su.uploader_role, 'supplier'),
           'at', su.created_at)
    into v_upload
    from supplier_uploads su
    left join profiles p on p.id = su.supplier_id
   where su.id = p_ref::bigint;

  -- written by the staff member who received it (the newest receiving)
  if to_regclass('public.receipt_deliveries') is not null then
    execute $q$
      select jsonb_build_object(
               'note', nullif(btrim(d.receive_note), ''),
               'by', d.received_by_name,
               'at', d.received_at,
               'items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'product_name', i.product_name,
                          'expected_qty', i.expected_qty,
                          'received_qty', i.received_qty,
                          'note', nullif(btrim(i.note), '')) order by i.id)
                   from receipt_delivery_items i
                  where i.delivery_id = d.id
                    and (nullif(btrim(i.note), '') is not null
                         or coalesce(i.received_qty, 0) < i.expected_qty)
               ), '[]'::jsonb))
        from receipt_deliveries d
       where d.receipt_ref = $1 and d.received_at is not null
       order by d.received_at desc
       limit 1
    $q$ into v_receiving using p_ref;
  end if;

  return jsonb_build_object('upload', v_upload, 'receiving', v_receiving);
end;
$function$;

-- ---------------------------------------------------------------------
-- The owner fixes how many pieces go in (only while not in stock yet)
--   p_items: [{ "id": <receipt_review_items.id>, "qty": <0 or more> }]
-- ---------------------------------------------------------------------
create or replace function public.admin_set_review_qty(p_items jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_e   jsonb;
  v_qty numeric;
  v_n   int;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can do this.' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'No quantities were sent.';
  end if;

  for v_e in select * from jsonb_array_elements(p_items)
  loop
    begin
      v_qty := (v_e->>'qty')::numeric;
    exception when others then
      raise exception 'Every quantity must be a whole number, 0 or more.';
    end;
    if v_qty is null or v_qty < 0 or v_qty <> trunc(v_qty) or v_qty > 1000000 then
      raise exception 'Every quantity must be a whole number, 0 or more.';
    end if;

    update receipt_review_items
       set qty_added = v_qty
     where id = (v_e->>'id')::bigint
       and status = 'pending'
       and stock_applied = false;

    get diagnostics v_n = row_count;
    if v_n = 0 then
      raise exception 'A product of this receipt is already in stock, so its quantity can''t change here.';
    end if;
  end loop;
end;
$function$;

revoke execute on function public.admin_receipt_notes(text) from public, anon;
revoke execute on function public.admin_set_review_qty(jsonb) from public, anon;
grant execute on function public.admin_receipt_notes(text) to authenticated;
grant execute on function public.admin_set_review_qty(jsonb) to authenticated;

commit;
