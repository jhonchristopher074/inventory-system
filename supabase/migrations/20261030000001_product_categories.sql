-- =====================================================================
-- Product categories, kept by the owner
-- ---------------------------------------------------------------------
-- The owner makes the categories (Inventory > Categories) and puts each
-- product in one. The receipt scanner (n8n) reads the same list from the
-- table public.categories (name + description) and gives each new product
-- one of those names.
--
-- Products keep their category as text in products.category (as before,
-- so nothing that reads it changes). "Uncategorized" means none.
--
-- Rules, kept by the database itself:
--   * a product's category is always one of the owner's categories, or
--     "Uncategorized". Anything else (e.g. a name the AI made up) becomes
--     "Uncategorized", for the owner to sort. Spelling is matched without
--     caring about capitals or extra spaces ("fasteners " -> "Fasteners").
--   * once a product has a category, only the owner can move it: a
--     restock from n8n can't undo the owner's choice.
--   * renaming a category moves its products along; deleting one makes
--     its products "Uncategorized".
--
-- The categories the products already use are copied in as the first list.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The list
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  name        text not null,
  -- what goes in it, in plain words: helps the AI (and new staff) choose
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- one "Fasteners", whatever the capitals
create unique index if not exists categories_name_key on public.categories (lower(name));

-- Only through the functions below (and n8n, which uses the service role).
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. First list: the categories the products already use
-- ---------------------------------------------------------------------
insert into public.categories (name)
select min(trim(category))
  from public.products
 where coalesce(trim(category), '') <> ''
   and lower(trim(category)) <> 'uncategorized'
 group by lower(trim(category))
on conflict do nothing;

-- the same spelling everywhere ("fasteners" -> "Fasteners"); done before
-- the rule below exists, which would keep the old spelling
update public.products p
   set category = c.name
  from public.categories c
 where lower(trim(p.category)) = lower(c.name)
   and p.category <> c.name;

update public.products
   set category = 'Uncategorized'
 where coalesce(trim(category), '') = '';

-- ---------------------------------------------------------------------
-- 3. The rule on products (see the top)
-- ---------------------------------------------------------------------
create or replace function public.products_use_known_category()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
begin
  if tg_op = 'UPDATE' then
    if new.category is not distinct from old.category then
      return new;
    end if;

    -- only the owner moves a product that already has a category
    -- (blank or "Uncategorized" = none yet: n8n may fill those in)
    if lower(coalesce(nullif(trim(old.category), ''), 'uncategorized')) <> 'uncategorized'
       and not public.is_admin() then
      new.category := old.category;
      return new;
    end if;
  end if;

  select c.name into v_name
    from categories c
   where lower(c.name) = lower(trim(coalesce(new.category, '')));

  new.category := coalesce(v_name, 'Uncategorized');
  return new;
end;
$function$;

drop trigger if exists products_use_known_category on public.products;
create trigger products_use_known_category
  before insert or update of category on public.products
  for each row execute function public.products_use_known_category();

-- ---------------------------------------------------------------------
-- 4. Reading the list (anyone logged in)
--    [{ id, name, description, product_count }], by name
-- ---------------------------------------------------------------------
create or replace function public.list_categories()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rows jsonb;
begin
  perform public.require_auth();

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'name', c.name,
           'description', c.description,
           'product_count', (
             select count(*)
               from products p
              where p.category = c.name
                and not coalesce(p.is_archived, false)
                and not coalesce(p.is_deleted, false)
           )
         ) order by lower(c.name)), '[]'::jsonb)
    into v_rows
    from categories c;

  return v_rows;
end;
$function$;

-- ---------------------------------------------------------------------
-- 5. The owner: add (p_id null) or change a category
-- ---------------------------------------------------------------------
create or replace function public.admin_save_category(p_id bigint, p_name text, p_description text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_description text := trim(coalesce(p_description, ''));
  v_old text;
  v_row categories%rowtype;
begin
  perform public.require_role(array['admin']);

  if v_name = '' then
    raise exception 'Enter a name for the category.';
  end if;

  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters or fewer.';
  end if;

  if length(v_description) > 300 then
    raise exception 'Keep the description to 300 characters or fewer.';
  end if;

  if lower(v_name) = 'uncategorized' then
    raise exception '"Uncategorized" is for products without a category. Choose another name.';
  end if;

  if exists (select 1 from categories where lower(name) = lower(v_name) and id is distinct from p_id) then
    raise exception 'There is already a category called "%".', v_name;
  end if;

  if p_id is null then
    insert into categories (name, description)
    values (v_name, v_description)
    returning * into v_row;
  else
    select name into v_old from categories where id = p_id for update;

    if not found then
      raise exception 'This category no longer exists. Reload the page.';
    end if;

    update categories
       set name = v_name, description = v_description, updated_at = now()
     where id = p_id
    returning * into v_row;

    -- renamed: its products go along
    if v_old <> v_name then
      update products set category = v_name where category = v_old;
    end if;
  end if;

  return to_jsonb(v_row);
end;
$function$;

-- ---------------------------------------------------------------------
-- 6. The owner: delete a category. Its products become "Uncategorized";
--    returns how many.
-- ---------------------------------------------------------------------
create or replace function public.admin_delete_category(p_id bigint)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
  v_moved integer;
begin
  perform public.require_role(array['admin']);

  delete from categories where id = p_id returning name into v_name;

  if v_name is null then
    raise exception 'This category no longer exists. Reload the page.';
  end if;

  update products set category = 'Uncategorized' where category = v_name;
  get diagnostics v_moved = row_count;

  return v_moved;
end;
$function$;

-- ---------------------------------------------------------------------
-- 7. The owner: put a product in a category ('' or null = Uncategorized)
--    Returns the category's name as saved.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_product_category(p_product_id bigint, p_category text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text;
begin
  perform public.require_role(array['admin']);

  if coalesce(trim(p_category), '') = '' or lower(trim(p_category)) = 'uncategorized' then
    v_name := 'Uncategorized';
  else
    select name into v_name from categories where lower(name) = lower(trim(p_category));

    if v_name is null then
      raise exception 'There is no category called "%". Add it under Categories first.', trim(p_category);
    end if;
  end if;

  update products set category = v_name where id = p_product_id;

  if not found then
    raise exception 'This product no longer exists. Reload the page.';
  end if;

  return v_name;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Who may call what
-- ---------------------------------------------------------------------
revoke execute on function public.products_use_known_category() from public, anon, authenticated;
revoke execute on function public.list_categories() from public, anon;
revoke execute on function public.admin_save_category(bigint, text, text) from public, anon;
revoke execute on function public.admin_delete_category(bigint) from public, anon;
revoke execute on function public.admin_set_product_category(bigint, text) from public, anon;

grant execute on function
  public.list_categories(),
  public.admin_save_category(bigint, text, text),
  public.admin_delete_category(bigint),
  public.admin_set_product_category(bigint, text)
to authenticated;
