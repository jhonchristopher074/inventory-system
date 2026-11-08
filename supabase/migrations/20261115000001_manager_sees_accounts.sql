-- =====================================================================
-- A Manager sees the accounts list
-- ---------------------------------------------------------------------
-- Run after 20261114000001_manager_role.sql.
--
-- The Manager can now see Profile & Users (admin_list_users) and disable /
-- enable staff, cashier and supplier accounts (the admin-action function
-- checks that). Creating accounts, changing roles, renaming, changing
-- emails and resetting passwords stay the Owner's.
--
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.require_role(p_roles text[])
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_role  text;
  v_query text;
begin
  perform public.require_auth();

  v_role := public.current_role();

  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'Not authorized for this action';
  end if;

  -- the accounts are the Owner's, except seeing the list
  if public.real_role() = 'manager' then
    v_query := lower(coalesce(current_query(), ''));
    if v_query ~ 'admin_[a-z_]*(user|employee|account|password|role)'
       and v_query !~ 'admin_list_users' then
      raise exception 'Only the owner can manage accounts.' using errcode = '42501';
    end if;
  end if;
end;
$function$;

commit;
