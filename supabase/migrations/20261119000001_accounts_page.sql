-- =====================================================================
-- Profile & Users: the accounts one page at a time
-- ---------------------------------------------------------------------
-- Run after 20261118000001_two_step_both_methods.sql.
--
-- list_accounts_page(p_search, p_tab, p_limit, p_offset)
--   One page of accounts, searched and filtered here in the database, so
--   the page stays fast with thousands of accounts:
--     { rows: [...], total: <rows of this tab>, counts: { all, admin,
--       manager, staff, cashier, supplier, disabled } }
--   p_tab: 'all' (accounts in use) | a role | 'disabled'
--   Search: name, email or account number. Hidden accounts never show.
--   The Owner and a Manager (as admin_list_users). The name has no
--   "account" after "admin_", so require_role lets a Manager use it.
--
-- Safe to run more than once.
-- =====================================================================

begin;

create or replace function public.list_accounts_page(
  p_search text default '',
  p_tab    text default 'all',
  p_limit  int  default 25,
  p_offset int  default 0
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  -- the search, with % and _ taken literally
  v_q      text := replace(replace(replace(lower(trim(coalesce(p_search, ''))), '\', '\\'), '%', '\%'), '_', '\_');
  v_no     text := ltrim(trim(coalesce(p_search, '')), '#');
  v_tab    text := coalesce(nullif(p_tab, ''), 'all');
  v_limit  int  := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset int  := greatest(coalesce(p_offset, 0), 0);
  v_counts jsonb;
  v_total  int;
  v_rows   jsonb;
begin
  perform public.require_role(array['admin']);

  -- how many in each tab (after the search)
  select jsonb_build_object(
           'all',      count(*) filter (where coalesce(p.is_active, true)),
           'admin',    count(*) filter (where p.role = 'admin'    and coalesce(p.is_active, true)),
           'manager',  count(*) filter (where p.role = 'manager'  and coalesce(p.is_active, true)),
           'staff',    count(*) filter (where p.role = 'staff'    and coalesce(p.is_active, true)),
           'cashier',  count(*) filter (where p.role = 'cashier'  and coalesce(p.is_active, true)),
           'supplier', count(*) filter (where p.role = 'supplier' and coalesce(p.is_active, true)),
           'disabled', count(*) filter (where p.is_active = false)
         )
    into v_counts
    from profiles p
   where not coalesce(p.is_hidden, false)
     and (v_q = ''
          or lower(coalesce(p.full_name, '')) like '%' || v_q || '%'
          or lower(coalesce(p.email, ''))     like '%' || v_q || '%'
          or (v_no <> '' and coalesce(p.account_no, '') like '%' || v_no || '%'));

  v_total := coalesce((v_counts ->> v_tab)::int, 0);

  -- this page: Owner, Manager, Staff, Cashier, Supplier, then A-Z
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank, x.sort_name), '[]'::jsonb)
    into v_rows
    from (
      select p.id, p.full_name, p.email, p.role, p.is_active, p.account_no,
             case p.role when 'admin' then 0 when 'manager' then 1 when 'staff' then 2
                         when 'cashier' then 3 when 'supplier' then 4 else 5 end as rank,
             lower(coalesce(p.full_name, p.email, '')) as sort_name
        from profiles p
       where not coalesce(p.is_hidden, false)
         and (v_q = ''
              or lower(coalesce(p.full_name, '')) like '%' || v_q || '%'
              or lower(coalesce(p.email, ''))     like '%' || v_q || '%'
              or (v_no <> '' and coalesce(p.account_no, '') like '%' || v_no || '%'))
         and case
               when v_tab = 'all'      then coalesce(p.is_active, true)
               when v_tab = 'disabled' then p.is_active = false
               else p.role = v_tab and coalesce(p.is_active, true)
             end
       order by rank, sort_name
       limit v_limit offset v_offset
    ) x;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'counts', v_counts);
end;
$function$;

revoke all on function public.list_accounts_page(text, text, int, int) from public, anon;
grant execute on function public.list_accounts_page(text, text, int, int) to authenticated;

commit;

notify pgrst, 'reload schema';
