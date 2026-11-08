-- =====================================================================
-- Two-step verification (authenticator app, 6-digit code)
-- ---------------------------------------------------------------------
-- Run after 20261116000001_activity_log_and_backup.sql.
-- Supabase > Authentication > Multi-Factor: "TOTP (App Authenticator)"
-- must be enabled (it is by default).
--
-- mfa_ok()          true unless the person has turned on two-step
--                   verification and this login hasn't passed it yet
-- is_owner(), is_admin(), current_role(), get_my_role()
--                   as before, but only after the code was entered: a
--                   stolen password alone opens nothing, even if the
--                   code screen in the browser is skipped
-- mfa_recovery_codes, owner_new_recovery_codes(), mfa_recovery_codes_left()
--                   8 one-time codes for a lost phone (stored hashed; the
--                   mfa-recovery function checks one and turns 2FA off)
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Has this login passed two-step verification (when it's on)?
-- ---------------------------------------------------------------------
create or replace function public.mfa_ok()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
         where user_id = auth.uid() and status = 'verified'
      );
$function$;

grant execute on function public.mfa_ok() to authenticated;

-- ---------------------------------------------------------------------
-- 2. The role checks, now also asking mfa_ok()
-- ---------------------------------------------------------------------
create or replace function public.is_owner()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.mfa_ok() and exists (
    select 1 from profiles
     where id = auth.uid() and role = 'admin' and coalesce(is_active, true)
  );
$function$;

create or replace function public.is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select public.mfa_ok() and exists (
    select 1 from profiles
     where id = auth.uid() and role in ('admin', 'manager') and coalesce(is_active, true)
  );
$function$;

create or replace function public.current_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when role = 'manager' then 'admin' else role end
    from profiles where id = auth.uid() and public.mfa_ok();
$function$;

create or replace function public.get_my_role()
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select case when role = 'manager' then 'admin' else role end
    from profiles where id = auth.uid() and public.mfa_ok();
$function$;

-- ---------------------------------------------------------------------
-- 3. Recovery codes (a lost phone)
-- ---------------------------------------------------------------------
create table if not exists public.mfa_recovery_codes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  code_hash  text not null,          -- sha-256 of the code (no dash, upper case)
  created_at timestamptz not null default now(),
  used_at    timestamptz
);

create index if not exists mfa_recovery_codes_user_idx on public.mfa_recovery_codes (user_id);

alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;

-- 8 new codes ("A1B2C-3D4E5"), shown once; the old ones stop working.
-- Only right after the 6-digit code (aal2).
create or replace function public.owner_new_recovery_codes()
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_codes text[] := '{}';
  v_code  text;
  i       int;
begin
  perform public.require_auth();
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'Enter the 6-digit code first.' using errcode = '42501';
  end if;

  delete from mfa_recovery_codes where user_id = auth.uid();

  for i in 1 .. 8 loop
    v_code := upper(encode(gen_random_bytes(5), 'hex'));
    insert into mfa_recovery_codes (user_id, code_hash)
    values (auth.uid(), encode(digest(v_code, 'sha256'), 'hex'));
    v_codes := v_codes || (substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5));
  end loop;

  return v_codes;
end;
$function$;

revoke all on function public.owner_new_recovery_codes() from public, anon;
grant execute on function public.owner_new_recovery_codes() to authenticated;

-- how many unused codes are left
create or replace function public.mfa_recovery_codes_left()
 returns int
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select count(*)::int from mfa_recovery_codes where user_id = auth.uid() and used_at is null;
$function$;

revoke all on function public.mfa_recovery_codes_left() from public, anon;
grant execute on function public.mfa_recovery_codes_left() to authenticated;

commit;

notify pgrst, 'reload schema';
