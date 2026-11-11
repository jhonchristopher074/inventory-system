-- =====================================================================
-- Notifications: "read" for each person, not for the whole role
-- ---------------------------------------------------------------------
-- Run after 20261121000001_sales_pages.sql.
--
-- A notification goes to a role (the Owner and a Manager share 'admin',
-- the cashiers 'cashier' ...), and its one is_read flag was shared too:
-- when the Manager opened one, it was read for the Owner as well, who never
-- saw it. Now each person has their own: notification_reads says who read
-- which one.
--
-- The four functions the bell uses keep their names and answers
-- (list_notifications still gives is_read, now the caller's own), so the
-- app doesn't change. The old is_read column is left as it was.
--
-- What was read before this is kept as read, for everyone it went to.
-- Safe to run more than once.
-- =====================================================================

begin;

create table if not exists public.notification_reads (
  notification_id bigint not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notification_reads_user_idx on public.notification_reads (user_id);

-- only through the functions below
alter table public.notification_reads enable row level security;
revoke all on table public.notification_reads from anon, authenticated;

-- what was read before: read for everyone it went to
insert into public.notification_reads (notification_id, user_id, read_at)
select n.id, p.id, coalesce(n.created_at::timestamptz, now())
  from public.notifications n
  join public.profiles p
    on n.recipient_role is null
    or n.recipient_role = case when p.role = 'manager' then 'admin' else p.role end
 where n.is_read
on conflict do nothing;


-- the newest notifications for my role, each with my own is_read
create or replace function public.list_notifications(p_limit integer default 10)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
  v_role text;
begin
  perform public.require_auth();

  v_role := public."current_role"();

  select coalesce(jsonb_agg((to_jsonb(n) - 'mine_read') || jsonb_build_object('is_read', n.mine_read)
                            order by n.created_at desc, n.id desc), '[]'::jsonb)
    into v_rows
    from (
      select x.*,
             exists (select 1 from notification_reads r
                      where r.notification_id = x.id and r.user_id = auth.uid()) as mine_read
        from notifications x
       where x.recipient_role is null
          or x.recipient_role = v_role
       order by x.created_at desc, x.id desc
       limit greatest(coalesce(p_limit, 10), 1)
    ) n;

  return v_rows;
end;
$function$;


create or replace function public.unread_notification_count()
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_count integer;
  v_role  text;
begin
  perform public.require_auth();

  v_role := public."current_role"();

  select count(*) into v_count
    from notifications n
   where (n.recipient_role is null or n.recipient_role = v_role)
     and not exists (select 1 from notification_reads r
                      where r.notification_id = n.id and r.user_id = auth.uid());

  return coalesce(v_count, 0);
end;
$function$;


create or replace function public.mark_notification_read(p_notification_id bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.require_auth();

  insert into notification_reads (notification_id, user_id)
  select n.id, auth.uid()
    from notifications n
   where n.id = p_notification_id
     and (n.recipient_role is null or n.recipient_role = public."current_role"())
  on conflict do nothing;

  return jsonb_build_object('id', p_notification_id, 'is_read', true);
end;
$function$;


create or replace function public.mark_all_notifications_read()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_count integer;
  v_role  text;
begin
  perform public.require_auth();

  v_role := public."current_role"();

  with added as (
    insert into notification_reads (notification_id, user_id)
    select n.id, auth.uid()
      from notifications n
     where (n.recipient_role is null or n.recipient_role = v_role)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from added;

  return jsonb_build_object('updated', v_count);
end;
$function$;

commit;

-- check: how many "read" marks each person has now
-- select p.full_name, p.role, count(r.*) from profiles p
--   left join notification_reads r on r.user_id = p.id group by 1, 2 order by 2, 1;
