-- =====================================================================
-- Activity log (who did what) and the Owner's backup
-- ---------------------------------------------------------------------
-- Run after 20261115000001_manager_sees_accounts.sql.
--
-- activity_log        one row per change: who, when, what, which item.
--                     Filled by the database itself (triggers below), so
--                     every way of changing things is caught. The account
--                     functions (create-employee, admin-action) add their
--                     own rows.
-- admin_list_activity the Owner reads it (a Manager can't: it's how the
--                     Owner checks the Manager's work too)
-- admin_backup        the Owner downloads every table in one go
--
-- A failed log write never blocks the change itself.
-- Safe to run more than once.
-- =====================================================================

begin;

create table if not exists public.activity_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_name  text,
  actor_role  text,
  action      text not null,          -- created | updated | deleted | downloaded
  entity      text not null,          -- product | category | refund | ...
  entity_id   text,
  entity_name text,
  details     jsonb not null default '{}'::jsonb
);

create index if not exists activity_log_created_at_idx on public.activity_log (created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log (entity, created_at desc);

alter table public.activity_log enable row level security;
revoke all on public.activity_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- The trigger: log_activity('<entity>', '<column>', '<column>', ...)
-- Only the listed columns count: an update that changes none of them
-- (e.g. a sale lowering the stock) isn't logged.
-- ---------------------------------------------------------------------
create or replace function public.log_activity()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_entity  text := tg_argv[0];
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_details jsonb := '{}'::jsonb;
  v_action  text;
  v_uid     uuid := auth.uid();
  v_name    text;
  v_role    text;
  i         int;
  c         text;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_row := coalesce(v_new, v_old);

  for i in 1 .. tg_nargs - 1 loop
    c := tg_argv[i];
    if tg_op = 'UPDATE' then
      if (v_old -> c) is distinct from (v_new -> c) then
        v_details := v_details || jsonb_build_object(c, jsonb_build_object('from', v_old -> c, 'to', v_new -> c));
      end if;
    elsif coalesce(v_row -> c, 'null'::jsonb) <> 'null'::jsonb then
      v_details := v_details || jsonb_build_object(c, v_row -> c);
    end if;
  end loop;

  if tg_op = 'UPDATE' then
    if v_details = '{}'::jsonb then return null; end if;
    v_action := 'updated';
  elsif tg_op = 'INSERT' then
    v_action := 'created';
  else
    v_action := 'deleted';
  end if;

  if v_uid is not null then
    select full_name, role into v_name, v_role from profiles where id = v_uid;
  end if;

  insert into activity_log (actor_id, actor_name, actor_role, action, entity, entity_id, entity_name, details)
  values (
    v_uid,
    coalesce(v_name, case when v_uid is null then 'System' end),
    coalesce(v_role, case when v_uid is null then 'system' end),
    v_action,
    v_entity,
    v_row ->> 'id',
    coalesce(v_row ->> 'name', v_row ->> 'product_name', v_row ->> 'title',
             v_row ->> 'supplier_name', v_row ->> 'file_name'),
    v_details
  );
  return null;
exception when others then
  return null; -- never block the change itself
end;
$function$;

revoke all on function public.log_activity() from public, anon, authenticated;

-- attach it to a table, if that table exists here
create or replace function pg_temp.watch(p_table text, p_entity text, p_columns text[], p_events text)
 returns void
 language plpgsql
as $function$
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  execute format('drop trigger if exists zz_activity_log on public.%I', p_table);
  execute format(
    'create trigger zz_activity_log after %s on public.%I for each row execute function public.log_activity(%s)',
    p_events, p_table,
    (select string_agg(quote_literal(x), ', ') from unnest(array[p_entity] || p_columns) x)
  );
end;
$function$;

select pg_temp.watch('products', 'product',
  array['name', 'price', 'last_cost', 'category', 'image_url', 'inspection_date',
        'is_disabled', 'is_archived', 'is_deleted'],
  'insert or update or delete');
select pg_temp.watch('categories', 'category', array['name'], 'insert or update or delete');
select pg_temp.watch('refund_requests', 'refund', array['status', 'amount'], 'insert or update or delete');
select pg_temp.watch('supplier_uploads', 'receipt', array['status'], 'insert or update or delete');
select pg_temp.watch('inspection_approvals', 'inspection', array['status'], 'insert or update or delete');
select pg_temp.watch('deliveries', 'delivery', array['status'], 'insert or update or delete');
select pg_temp.watch('receipt_deliveries', 'delivery', array['status'], 'insert or update or delete');
select pg_temp.watch('documentations', 'documentation', array['title'], 'insert or delete');
select pg_temp.watch('store_settings', 'store logo', array['logo_path'], 'update');

-- ---------------------------------------------------------------------
-- The Owner reads the log (newest first)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_activity(
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_entity text default null,
  p_limit  int default 5000
)
 returns setof public.activity_log
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_auth();
  if not public.is_owner() then
    raise exception 'Only the owner can see the activity log.' using errcode = '42501';
  end if;

  return query
    select *
      from activity_log a
     where (p_from is null or a.created_at >= p_from)
       and (p_to is null or a.created_at < p_to)
       and (p_entity is null or a.entity = p_entity)
     order by a.created_at desc, a.id desc
     limit least(greatest(coalesce(p_limit, 5000), 1), 20000);
end;
$function$;

revoke all on function public.admin_list_activity(timestamptz, timestamptz, text, int) from public, anon;
grant execute on function public.admin_list_activity(timestamptz, timestamptz, text, int) to authenticated;

-- ---------------------------------------------------------------------
-- The Owner's backup: every table, as { table: [rows] }
-- ---------------------------------------------------------------------
create or replace function public.admin_backup()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_tables text[] := array[
    'products', 'categories', 'sales', 'sale_items',
    'refund_requests', 'refund_request_items', 'stock_movements',
    'deliveries', 'receipt_deliveries', 'receipt_delivery_items',
    'supplier_uploads', 'receipt_review_items', 'inspection_approvals',
    'documentations', 'profiles', 'store_settings', 'activity_log'
  ];
  v_out  jsonb := '{}'::jsonb;
  v_rows jsonb;
  t      text;
  v_name text;
  v_role text;
begin
  perform public.require_auth();
  if not public.is_owner() then
    raise exception 'Only the owner can download a backup.' using errcode = '42501';
  end if;

  foreach t in array v_tables loop
    if to_regclass('public.' || t) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into v_rows;
      v_out := v_out || jsonb_build_object(t, v_rows);
    end if;
  end loop;

  select full_name, role into v_name, v_role from profiles where id = auth.uid();
  insert into activity_log (actor_id, actor_name, actor_role, action, entity, details)
  values (auth.uid(), v_name, v_role, 'downloaded', 'backup',
          (select jsonb_object_agg(k, jsonb_array_length(v)) from jsonb_each(v_out) as e(k, v)));

  return v_out;
end;
$function$;

revoke all on function public.admin_backup() from public, anon;
grant execute on function public.admin_backup() to authenticated;

commit;

notify pgrst, 'reload schema';
