-- =====================================================================
-- Two-step verification: email AND authenticator app at the same time
-- ---------------------------------------------------------------------
-- Run after 20261117000001_owner_two_step.sql.
-- Then deploy again: npx supabase functions deploy email-2fa
--
-- Either method passes the login (mfa_ok() already accepts either one).
-- get_two_step_state() now says which are on:
--   { email: true|false, app: true|false, method, verified, codes_left }
--   (method: 'email', 'app' or 'none', as before, for older pages)
--
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.get_two_step_state()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_email boolean;
  v_app   boolean;
begin
  if v_uid is null then return null; end if;

  v_email := exists (select 1 from two_step_email where user_id = v_uid);
  v_app := exists (select 1 from auth.mfa_factors where user_id = v_uid and status = 'verified');

  return jsonb_build_object(
    'email', v_email,
    'app', v_app,
    'method', case when v_email then 'email' when v_app then 'app' else 'none' end,
    'verified', public.mfa_ok(),
    'codes_left', (select count(*) from mfa_recovery_codes where user_id = v_uid and used_at is null)
  );
end;
$function$;

revoke all on function public.get_two_step_state() from public, anon;
grant execute on function public.get_two_step_state() to authenticated;

commit;

notify pgrst, 'reload schema';
