-- =====================================================================
-- A Manager: runs the store like the Owner, without the accounts
-- ---------------------------------------------------------------------
-- Run after 20261113000001_free_stuck_deliveries.sql.
--
-- The Owner (role 'admin') is the super admin. A Manager (role 'manager')
-- does everything the Owner does day to day: inventory, POS, sales,
-- refunds, calendar, approvals, prices, documentation, the store logo,
-- and gets the Owner's notifications.
-- Only the Owner can: see the accounts list, create accounts (the
-- create-employee function), change anyone's role / active status /
-- account number, reset passwords (the admin-action function).
--
-- How: the database treats a Manager as the Owner (current_role(),
-- get_my_role() and is_admin() say 'admin'), except where it matters:
--   is_owner()          true only for the real Owner
--   real_role()         the role as it is ('manager' stays 'manager')
--   require_role()      refuses a Manager the account functions
--   profiles            its rules use is_owner() / real_role(): a
--                       Manager reads and changes only his own profile
-- The app reads the real role from get_my_profile() (unchanged).
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. 'manager' is a role
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists valid_role;
alter table public.profiles add constraint valid_role
  check (role = any (array['admin', 'manager', 'cashier', 'staff', 'supplier']));

-- ---------------------------------------------------------------------
-- 2. Who is who
-- ---------------------------------------------------------------------
-- the role as it is in the profile
create or replace function public.real_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select role from profiles where id = auth.uid();
$function$;

-- the real Owner (active)
create or replace function public.is_owner()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
     where id = auth.uid() and role = 'admin' and coalesce(is_active, true)
  );
$function$;

-- the Owner or a Manager (active): every "admin" check in the system
create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from profiles
     where id = auth.uid() and role in ('admin', 'manager') and coalesce(is_active, true)
  );
$function$;

-- the role the rules check: a Manager counts as 'admin'
create or replace function public.current_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when role = 'manager' then 'admin' else role end
    from profiles where id = auth.uid();
$function$;

create or replace function public.get_my_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when role = 'manager' then 'admin' else role end
    from profiles where id = auth.uid();
$function$;

-- ---------------------------------------------------------------------
-- 3. require_role: as before, but a Manager can't use the account
--    functions (listing, creating, changing, resetting accounts)
-- ---------------------------------------------------------------------
create or replace function public.require_role(p_roles text[])
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
begin
  perform public.require_auth();

  v_role := public.current_role();

  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'Not authorized for this action';
  end if;

  -- the accounts are the Owner's only
  if public.real_role() = 'manager'
     and lower(coalesce(current_query(), '')) ~ 'admin_[a-z_]*(user|employee|account|password|role)' then
    raise exception 'Only the owner can manage accounts.' using errcode = '42501';
  end if;
end;
$function$;

-- ---------------------------------------------------------------------
-- 4. Profiles: only the Owner changes account details (a Manager, like
--    everyone else, only his own photo)
-- ---------------------------------------------------------------------
create or replace function public.protect_profile_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') and not public.is_owner() then
    if (to_jsonb(new) - 'avatar_url' - 'updated_at')
       is distinct from (to_jsonb(old) - 'avatar_url' - 'updated_at') then
      raise exception 'Only the owner can change account details. You can change your photo and password.';
    end if;
  end if;
  return new;
end;
$function$;

-- the profiles table's own rules: "the admin can …" becomes "the Owner
-- can …" (a Manager reads only his own profile, so not the accounts list)
do $$
declare
  p record;
  v_using text;
  v_check text;
  v_sql text;
begin
  for p in
    select policyname, permissive, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public' and tablename = 'profiles'
       and (coalesce(qual, '') ~ '(is_admin|get_my_role|current_role)\(\)'
            or coalesce(with_check, '') ~ '(is_admin|get_my_role|current_role)\(\)')
  loop
    v_using := regexp_replace(regexp_replace(regexp_replace(coalesce(p.qual, ''),
                 'is_admin\(\)', 'is_owner()', 'g'),
                 'get_my_role\(\)', 'real_role()', 'g'),
                 'current_role\(\)', 'real_role()', 'g');
    v_check := regexp_replace(regexp_replace(regexp_replace(coalesce(p.with_check, ''),
                 'is_admin\(\)', 'is_owner()', 'g'),
                 'get_my_role\(\)', 'real_role()', 'g'),
                 'current_role\(\)', 'real_role()', 'g');

    execute format('drop policy %I on public.profiles', p.policyname);

    v_sql := format('create policy %I on public.profiles as %s for %s to %s',
                    p.policyname, p.permissive, p.cmd,
                    (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r));
    if v_using <> '' then v_sql := v_sql || format(' using (%s)', v_using); end if;
    if v_check <> '' then v_sql := v_sql || format(' with check (%s)', v_check); end if;
    execute v_sql;
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 5. The staff to pick (assign a delivery to receive): names only, for the
--    Owner and a Manager (not the accounts list)
-- ---------------------------------------------------------------------
create or replace function public.list_staff_names()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin() then
    raise exception 'Only the owner or a manager can do this.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'full_name', full_name, 'email', email, 'role', role, 'is_active', is_active)
                     order by coalesce(nullif(btrim(full_name), ''), email))
      from profiles
     where role = 'staff' and coalesce(is_active, true) and not coalesce(is_hidden, false)
  ), '[]'::jsonb);
end;
$function$;

revoke execute on function public.real_role() from public, anon;
revoke execute on function public.is_owner() from public, anon;
revoke execute on function public.list_staff_names() from public, anon;
grant execute on function public.real_role() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.list_staff_names() to authenticated;

commit;

-- check: the rules on profiles now (should mention is_owner / real_role)
select policyname, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename = 'profiles';
