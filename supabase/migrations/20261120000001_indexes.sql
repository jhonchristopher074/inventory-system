-- =====================================================================
-- Indexes: fast lookups on the busy tables as the data grows
-- ---------------------------------------------------------------------
-- Run after 20261119000001_accounts_page.sql.
--
-- An index is like a book's index: the database finds the rows it needs
-- (today's sales, one product's stock history, unread notifications …)
-- without reading the whole table. Small tables don't notice; with years
-- of sales it's the difference between instant and slow.
--
-- Each one is made only if its table and columns exist here (some tables
-- were made in the Supabase dashboard), and never twice.
-- Safe to run more than once.
-- =====================================================================

begin;

-- index_if(name, table, 'col1, col2 desc'): make it when every column exists
create or replace function pg_temp.index_if(p_name text, p_table text, p_columns text)
 returns void
 language plpgsql
as $function$
declare
  v_col text;
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  foreach v_col in array regexp_split_to_array(p_columns, '\s*,\s*') loop
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = p_table
         and column_name = split_part(trim(v_col), ' ', 1)
    ) then
      return;
    end if;
  end loop;
  execute format('create index if not exists %I on public.%I (%s)', p_name, p_table, p_columns);
end;
$function$;

-- sales: by day (dashboards, Sales History, reports) and by cashier
select pg_temp.index_if('sales_created_at_idx', 'sales', 'created_at desc');
select pg_temp.index_if('sales_cashier_idx', 'sales', 'cashier_id, created_at desc');

-- the products of each sale, and every sale of a product
select pg_temp.index_if('sale_items_sale_idx', 'sale_items', 'sale_id');
select pg_temp.index_if('sale_items_product_idx', 'sale_items', 'product_id');

-- products: by category, and the active / archived lists
select pg_temp.index_if('products_category_idx', 'products', 'category');
select pg_temp.index_if('products_archived_idx', 'products', 'is_archived');
select pg_temp.index_if('products_inspection_date_idx', 'products', 'inspection_date');

-- notifications: the newest first, per role, unread ones
select pg_temp.index_if('notifications_created_at_idx', 'notifications', 'created_at desc');
select pg_temp.index_if('notifications_role_read_idx', 'notifications', 'recipient_role, is_read');

-- accounts: Profile & Users tabs (list_accounts_page)
select pg_temp.index_if('profiles_role_idx', 'profiles', 'role, is_active');

-- receipts and inspections waiting for the owner
select pg_temp.index_if('supplier_uploads_status_idx', 'supplier_uploads', 'status, created_at desc');
select pg_temp.index_if('inspection_approvals_product_idx', 'inspection_approvals', 'product_id, status');

-- deliveries by date (Calendar)
select pg_temp.index_if('deliveries_date_idx', 'deliveries', 'delivery_date');
select pg_temp.index_if('receipt_deliveries_date_idx', 'receipt_deliveries', 'expected_date');

commit;

-- the planner learns about the new indexes
analyze;
