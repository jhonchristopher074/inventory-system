-- =====================================================================
-- 2026-10-15 (run AFTER 20261015000001_ownership_by_id_and_receipt_retry.sql)
--
-- Staff and cashier profiles are now the same: you can change your photo
-- and password, but not your name or email — only the administrator can.
--
-- 1. Name and email can't be changed by the user anymore. Checked by the
--    database itself, so it can't be done by skipping the app either.
-- 2. Cashiers can upload a profile photo (the "documents" bucket only
--    allowed staff and admin), but only into the avatars folder.
--
-- Run the whole file in Supabase > SQL Editor. One transaction.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Name and email: administrator only
-- ---------------------------------------------------------------------

create or replace function public.protect_profile_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not is_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only an admin can change a user''s role.';
    end if;
    if new.is_active is distinct from old.is_active then
      raise exception 'Only an admin can activate or deactivate a user.';
    end if;
    if new.is_hidden is distinct from old.is_hidden then
      raise exception 'Only an admin can hide or unhide a user.';
    end if;
    if new.account_no is distinct from old.account_no then
      raise exception 'Only an admin can change an account number.';
    end if;
    if new.full_name is distinct from old.full_name then
      raise exception 'Only the administrator can change your name.';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Only the administrator can change your email.';
    end if;
  end if;
  return new;
end;
$function$;

-- Make sure the check above actually runs on profile updates (it's only
-- added if no trigger uses it yet).
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgfoid = 'public.protect_profile_privilege_fields'::regproc
      and not tgisinternal
  ) then
    create trigger protect_profile_privilege_fields
      before update on public.profiles
      for each row execute function public.protect_profile_privilege_fields();
  end if;
end
$$;

-- The profile pages no longer rename; nothing else should call this.
revoke execute on function public.update_my_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Profile photos for cashiers
-- ---------------------------------------------------------------------

drop policy if exists "documents: staff and admin upload" on storage.objects;
drop policy if exists "documents: staff and admin upload, cashier avatars" on storage.objects;

create policy "documents: staff and admin upload, cashier avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      public.get_my_role() in ('staff', 'admin')
      or (
        public.get_my_role() = 'cashier'
        and (storage.foldername(name))[1] = 'avatars'
      )
    )
  );

commit;
