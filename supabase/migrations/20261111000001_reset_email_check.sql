-- =====================================================================
-- Forgot password: is this email an account?
-- ---------------------------------------------------------------------
-- Run after 20261110000001_delete_delivery.sql.
--
-- The login page's "Forgot password?" now says "No account uses this
-- email" instead of pretending to send a code. It's callable before
-- logging in, so it only answers yes / no (nothing about the account),
-- and only for an active account.
--
-- Until this is run, the page sends the code without checking.
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.reset_email_exists(p_email text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
      from auth.users u
      left join public.profiles p on p.id = u.id
     where lower(u.email) = lower(btrim(coalesce(p_email, '')))
       and u.deleted_at is null
       and coalesce(p.is_active, true)
  );
$function$;

revoke execute on function public.reset_email_exists(text) from public;
grant execute on function public.reset_email_exists(text) to anon, authenticated;

commit;
