-- =====================================================================
-- Two-step verification for the Owner: a 6-digit code by email (or from
-- an authenticator app), after the password
-- ---------------------------------------------------------------------
-- Run after 20261116000001_activity_log_and_backup.sql.
-- Then deploy: npx supabase functions deploy email-2fa mfa-recovery admin-action create-employee
-- The email is sent with Resend (the RESEND_API_KEY secret, the same one
-- notify-owner-email uses).
--
-- two_step_email      who has the email code turned on
-- two_step_email_codes  the codes sent (hashed, 10 minutes, 5 tries)
-- two_step_sessions   logins that entered the email code (by session id,
--                     so it lasts until that login ends)
-- mfa_ok()            true unless two-step verification is on and this
--                     login hasn't passed it
-- is_owner(), is_admin(), current_role(), get_my_role()
--                     as before, only after the code: a stolen password
--                     alone opens nothing, even if the code screen is skipped
-- get_two_step_state()  { method: none | email | app, verified, codes_left }
-- mfa_recovery_codes, owner_new_recovery_codes()
--                     8 one-time codes for a lost phone / email
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Email codes
-- ---------------------------------------------------------------------
create table if not exists public.two_step_email (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  enabled_at timestamptz not null default now()
);

create table if not exists public.two_step_email_codes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  session_id  uuid not null,
  code_hash   text not null,
  purpose     text not null default 'login' check (purpose in ('login', 'enable', 'disable')),
  attempts    int not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create index if not exists two_step_email_codes_user_idx on public.two_step_email_codes (user_id, created_at desc);

create table if not exists public.two_step_sessions (
  session_id  uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  verified_at timestamptz not null default now()
);

alter table public.two_step_email enable row level security;
alter table public.two_step_email_codes enable row level security;
alter table public.two_step_sessions enable row level security;
revoke all on public.two_step_email, public.two_step_email_codes, public.two_step_sessions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Has this login passed two-step verification (when it's on)?
-- ---------------------------------------------------------------------
create or replace function public.mfa_ok()
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid     uuid := auth.uid();
  v_session text := auth.jwt() ->> 'session_id';
  v_app     boolean;
  v_email   boolean;
begin
  if v_uid is null then return false; end if;

  v_app := exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified');
  v_email := exists (select 1 from two_step_email where user_id = v_uid);

  if not v_app and not v_email then return true; end if;
  if v_app and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2' then return true; end if;
  if v_email and v_session is not null and exists (
       select 1 from two_step_sessions where session_id = v_session::uuid and user_id = v_uid
     ) then
    return true;
  end if;
  return false;
end;
$function$;

grant execute on function public.mfa_ok() to authenticated;

-- ---------------------------------------------------------------------
-- 3. The role checks, now also asking mfa_ok()
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
-- 4. Recovery codes (lost phone / no access to the email)
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
-- Only with two-step verification on, and passed by this login.
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
  if not exists (select 1 from two_step_email where user_id = auth.uid())
     and not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified') then
    raise exception 'Turn on two-step verification first.' using errcode = '42501';
  end if;
  if not public.mfa_ok() then
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

-- ---------------------------------------------------------------------
-- 5. The state the app needs: which method, passed or not, codes left
-- ---------------------------------------------------------------------
create or replace function public.get_two_step_state()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid    uuid := auth.uid();
  v_method text := 'none';
begin
  if v_uid is null then return null; end if;

  if exists (select 1 from two_step_email where user_id = v_uid) then
    v_method := 'email';
  elsif exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified') then
    v_method := 'app';
  end if;

  return jsonb_build_object(
    'method', v_method,
    'verified', public.mfa_ok(),
    'codes_left', (select count(*) from mfa_recovery_codes where user_id = v_uid and used_at is null)
  );
end;
$function$;

revoke all on function public.get_two_step_state() from public, anon;
grant execute on function public.get_two_step_state() to authenticated;

-- (an earlier draft of this file had this one)
drop function if exists public.mfa_recovery_codes_left();

commit;

notify pgrst, 'reload schema';
