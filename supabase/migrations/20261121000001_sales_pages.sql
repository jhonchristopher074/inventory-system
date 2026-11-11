-- =====================================================================
-- Sales History: one page at a time, the totals worked out here
-- ---------------------------------------------------------------------
-- Run after 20261120000001_indexes.sql.
--
-- Sales History and the dashboards used to load every sale ever made
-- (list_all_sales) and add them up in the browser: fast with a few hundred
-- sales, slow after a year or two. Now the database does it:
--
--   sales_page(p_from, p_to, p_cashier, p_search, p_sort, p_dir, p_limit, p_offset)
--     { rows: [sales, the same as list_all_sales gives], total }
--     p_sort 'date' | 'total', p_dir 'desc' | 'asc'; p_limit 0 = all rows
--     (the PDF / Excel download, the dashboard's last 30 days)
--
--   sales_summary(p_from, p_to, p_cashier, p_search, p_tz)
--     { net, count, items, products, refunded, refunded_sales, first_sale,
--       previous_net (the same length of time just before p_from),
--       days: [{ day, total, count }] (the chart), top: [5 best selling],
--       cashiers: [{ key, name }] (every cashier with sales) }
--
-- p_from / p_to: the period (p_to not included), null = no limit
-- p_cashier: a cashier's id (or name, for old sales without one)
-- p_search: a sale number, cashier or product
-- The Owner and a Manager see every sale; a cashier only their own.
--
-- Safe to run more than once.
-- =====================================================================

begin;

-- the sales the caller may see, with the filters (used by the two below)
create or replace function public.sales_filtered(
  p_from    timestamptz,
  p_to      timestamptz,
  p_cashier text,
  p_search  text
)
 returns setof public.sales
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_all boolean;
  -- "#12" finds sale 12 and up (120, 1234 ...), like the page did
  v_q   text := lower(ltrim(btrim(coalesce(p_search, '')), '#'));
begin
  perform public.require_role(array['admin', 'cashier']);
  v_all := public."current_role"() = 'admin';

  return query
    select s.*
      from sales s
      left join profiles p on p.id = s.cashier_id
     where (v_all or s.cashier_id = auth.uid())
       and (p_from is null or s.created_at >= p_from)
       and (p_to is null or s.created_at < p_to)
       and (nullif(p_cashier, '') is null
            or coalesce(s.cashier_id::text, p.full_name, s.cashier_name, 'Unknown cashier') = p_cashier)
       and (v_q = ''
            or left(s.id::text, length(v_q)) = v_q
            or strpos(lower(coalesce(p.full_name, s.cashier_name, '')), v_q) > 0
            or exists (select 1 from sale_items i
                        where i.sale_id = s.id and strpos(lower(coalesce(i.product_name, '')), v_q) > 0));
end;
$function$;

revoke all on function public.sales_filtered(timestamptz, timestamptz, text, text) from public, anon, authenticated;


create or replace function public.sales_page(
  p_from    timestamptz default null,
  p_to      timestamptz default null,
  p_cashier text        default null,
  p_search  text        default null,
  p_sort    text        default 'date',
  p_dir     text        default 'desc',
  p_limit   int         default 10,
  p_offset  int         default 0
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_total  int;
  v_rows   jsonb;
  v_total_sort boolean := coalesce(p_sort, 'date') = 'total';
  v_asc    boolean := coalesce(p_dir, 'desc') = 'asc';
  v_limit  int := nullif(greatest(coalesce(p_limit, 10), 0), 0); -- 0 = every row
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  select count(*) into v_total
    from public.sales_filtered(p_from, p_to, p_cashier, p_search);

  select coalesce(jsonb_agg(t.row_data order by t.n), '[]'::jsonb)
    into v_rows
    from (
      select row_number() over (order by
               case when v_total_sort and v_asc then s.total_amount end asc,
               case when v_total_sort and not v_asc then s.total_amount end desc,
               case when not v_total_sort and v_asc then s.created_at end asc,
               case when not v_total_sort and not v_asc then s.created_at end desc,
               case when v_asc then s.id end asc,
               s.id desc) as n,
             to_jsonb(s) || jsonb_build_object(
               'profiles', case when p.id is null then null else jsonb_build_object('full_name', p.full_name) end,
               'sale_items', public.sale_items_json(s.id)
             ) as row_data
        from public.sales_filtered(p_from, p_to, p_cashier, p_search) s
        left join profiles p on p.id = s.cashier_id
       order by n
       limit v_limit offset v_offset
    ) t;

  return jsonb_build_object('rows', v_rows, 'total', v_total);
end;
$function$;


create or replace function public.sales_summary(
  p_from    timestamptz default null,
  p_to      timestamptz default null,
  p_cashier text        default null,
  p_search  text        default null,
  p_tz      text        default 'Asia/Manila'
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tz     text := coalesce(nullif(p_tz, ''), 'Asia/Manila');
  v_result jsonb;
begin
  -- an unknown time zone: the store's
  begin
    perform now() at time zone v_tz;
  exception when others then
    v_tz := 'Asia/Manila';
  end;

  -- (sales_filtered checks who's asking; f is worked out once)
  with f as materialized (select * from public.sales_filtered(p_from, p_to, p_cashier, p_search)),
  items as materialized (select i.* from sale_items i join f on f.id = i.sale_id)
  select jsonb_build_object(
           'net',            coalesce((select sum(total_amount) from f), 0),
           'count',          (select count(*) from f),
           'refunded',       coalesce((select sum(refunded_amount) from f), 0),
           'refunded_sales', (select count(*) from f where refunded_amount > 0),
           'items',          coalesce((select sum(quantity) from items), 0),
           'products',       (select count(distinct product_name) from items),
           'first_sale',     (select min(created_at) from f),
           'previous_net',   case when p_from is null then null else (
                               select coalesce(sum(total_amount), 0)
                                 from public.sales_filtered(p_from - (coalesce(p_to, now()) - p_from), p_from, p_cashier, p_search)) end,
           'days',           coalesce((
                               select jsonb_agg(jsonb_build_object('day', d.day, 'total', d.total, 'count', d.n) order by d.day)
                                 from (select (created_at at time zone v_tz)::date as day,
                                              sum(total_amount) as total, count(*) as n
                                         from f group by 1) d), '[]'::jsonb),
           'top',            coalesce((
                               select jsonb_agg(jsonb_build_object('name', t.name, 'quantity', t.quantity, 'total', t.total)
                                                order by t.total desc, t.name)
                                 from (select coalesce(product_name, 'Unknown product') as name,
                                              sum(quantity) as quantity,
                                              sum(coalesce(subtotal, price * quantity)) as total
                                         from items group by 1
                                        order by 3 desc, 1
                                        limit 5) t), '[]'::jsonb),
           'cashiers',       coalesce((
                               select jsonb_agg(jsonb_build_object('key', c.key, 'name', c.name) order by lower(c.name))
                                 from (select coalesce(s.cashier_id::text, p.full_name, s.cashier_name, 'Unknown cashier') as key,
                                              max(coalesce(p.full_name, s.cashier_name, 'Unknown cashier')) as name
                                         from sales s left join profiles p on p.id = s.cashier_id
                                        where public."current_role"() = 'admin' or s.cashier_id = auth.uid()
                                        group by 1) c), '[]'::jsonb)
         )
    into v_result;

  return v_result;
end;
$function$;

-- the page's own login may call them; each one checks the role
revoke all on function public.sales_page(timestamptz, timestamptz, text, text, text, text, int, int) from public, anon;
revoke all on function public.sales_summary(timestamptz, timestamptz, text, text, text) from public, anon;
grant execute on function public.sales_page(timestamptz, timestamptz, text, text, text, text, int, int) to authenticated;
grant execute on function public.sales_summary(timestamptz, timestamptz, text, text, text) to authenticated;

commit;
