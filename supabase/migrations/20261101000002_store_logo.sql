-- =====================================================================
-- Store logo: the Owner can upload the store's own logo (Profile page)
-- ---------------------------------------------------------------------
-- The logo is one picture in the public "branding" bucket (PNG, WebP or
-- JPEG, at most 1 MB). The app crops it to a square before uploading.
-- Its file name is kept in store_settings; everyone, even before logging
-- in (the login page), reads it with get_store_logo().
--
-- Changing it needs the Owner's password: admin_set_store_logo() checks
-- it against the login password in Supabase Auth. The app then deletes
-- the old picture, so only the current logo is ever kept.
--
-- Until this is run, the app shows its built-in logo (/logo.svg) and the
-- Profile page says the logo can't be changed yet.
-- Safe to run more than once.
--
-- If Supabase says "must be owner of table objects" at the policies,
-- create the same three policies in Storage > Policies instead.
-- =====================================================================

begin;

-- crypt(): checks a password against Supabase Auth's stored hash
-- (already there on Supabase; older projects have it in public)
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- The bucket: anyone can view the logo; the limits are checked by
-- Supabase Storage itself, whatever the app sends.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 1048576, array['image/png', 'image/webp', 'image/jpeg'])
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- only the Owner uploads, lists (to clean up) and deletes logos
drop policy if exists "branding: admin uploads" on storage.objects;
drop policy if exists "branding: admin lists" on storage.objects;
drop policy if exists "branding: admin deletes" on storage.objects;

create policy "branding: admin uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'branding' and public.is_admin());

create policy "branding: admin lists" on storage.objects
  for select to authenticated
  using (bucket_id = 'branding' and public.is_admin());

create policy "branding: admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'branding' and public.is_admin());

-- ---------------------------------------------------------------------
-- The store's settings: one row. Nobody reads or writes the table
-- directly (no policies); the two functions below do.
-- ---------------------------------------------------------------------
create table if not exists public.store_settings (
  id         boolean primary key default true check (id),
  logo_path  text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.store_settings (id) values (true) on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke all on public.store_settings from anon, authenticated;

-- The current logo's file name in the branding bucket, or null for the
-- built-in one. Open to everyone: the login page shows it.
create or replace function public.get_store_logo()
returns text
language sql
stable security definer
set search_path = public
as $$
  select logo_path from public.store_settings where id;
$$;

revoke execute on function public.get_store_logo() from public;
grant execute on function public.get_store_logo() to anon, authenticated;

-- Sets the logo (p_path: a file already uploaded to the branding bucket,
-- or null for the built-in logo). Owner only, with the Owner's password.
-- Returns the old file name, for the app to delete.
create or replace function public.admin_set_store_logo(p_password text, p_path text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ok  boolean;
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Only the Owner can change the logo.' using errcode = '42501';
  end if;

  -- crypt() from pgcrypto, wherever it's installed (extensions or public)
  select u.encrypted_password = crypt(coalesce(p_password, ''), u.encrypted_password)
  into v_ok
  from auth.users u
  where u.id = auth.uid();

  if not coalesce(v_ok, false) then
    -- a second's wait makes guessing the password slow
    perform pg_sleep(1);
    raise exception 'Wrong password.' using errcode = '28P01';
  end if;

  if p_path is not null then
    if p_path !~ '^logo-[0-9]+\.(png|webp|jpg)$' then
      raise exception 'That is not a logo file.' using errcode = '22023';
    end if;

    if not exists (select 1 from storage.objects where bucket_id = 'branding' and name = p_path) then
      raise exception 'The new logo was not uploaded. Try again.' using errcode = 'P0002';
    end if;
  end if;

  select logo_path into v_old from public.store_settings where id for update;

  update public.store_settings
  set logo_path  = p_path,
      updated_at = now(),
      updated_by = auth.uid()
  where id;

  return v_old;
end;
$$;

revoke execute on function public.admin_set_store_logo(text, text) from public, anon;
grant execute on function public.admin_set_store_logo(text, text) to authenticated;

commit;

-- check: the bucket's limits, and the current logo (null = built-in)
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'branding';
select public.get_store_logo() as current_logo;
