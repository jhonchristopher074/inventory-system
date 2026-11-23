-- =====================================================================
-- Clear the store's data before the defense: products, stock, sales,
-- refunds, receipts, deliveries, inspections, documentation,
-- notifications and the activity log. KEEPS every account (profiles and
-- logins), two-step settings and the store logo.
--
-- 1. Download a backup first (Owner: Profile > backup), or check that
--    last night's backup ran.
-- 2. Run STEP 1 alone and read the counts.
-- 3. Run STEP 2. It can't be undone (except from the backup).
--
-- TRUNCATE doesn't fire the row triggers, so no activity-log rows,
-- notifications or low-stock alerts are made while clearing.
-- =====================================================================


-- STEP 1: what will be removed (nothing changes)
select 'products' as table_name, count(*) from public.products
union all select 'categories', count(*) from public.categories
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'sales', count(*) from public.sales
union all select 'sale_items', count(*) from public.sale_items
union all select 'refund_requests', count(*) from public.refund_requests
union all select 'inspection_approvals', count(*) from public.inspection_approvals
union all select 'documentations', count(*) from public.documentations
union all select 'deliveries', count(*) from public.deliveries
union all select 'supplier_uploads', count(*) from public.supplier_uploads
union all select 'receipt_review_items', count(*) from public.receipt_review_items
union all select 'receipt_deliveries', count(*) from public.receipt_deliveries
union all select 'notifications', count(*) from public.notifications
union all select 'activity_log', count(*) from public.activity_log
union all select 'profiles (KEPT)', count(*) from public.profiles;


-- STEP 2: clear (run after reading STEP 1)
begin;

-- sale numbers, product ids and the rest start again at 1
truncate table
  public.sale_items,
  public.sales,
  public.refund_request_items,
  public.refund_requests,
  public.stock_movements,
  public.inspection_approvals,
  public.notification_reads,
  public.notifications,
  public.products,
  public.documentations,
  public.deliveries,
  public.receipt_review_items,
  public.receipt_markups,
  public.receipt_delivery_items,
  public.receipt_deliveries,
  public.supplier_notice_marks,
  public.purchase_order_items,
  public.purchase_orders,
  public.activity_log
restart identity;

-- Receipts keep counting up (no restart): their files in storage are
-- named by receipt number, and a new receipt with an old number would be
-- taken as already sent to the scanner.
truncate table public.supplier_uploads continue identity;

-- Categories: remove the "--" below to clear them too. Left as they are,
-- the category list stays ready for new products.
-- truncate table public.categories restart identity;

commit;
