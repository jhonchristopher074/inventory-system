// Guest mode's stand-in for the Supabase client (lib/guestMode.js): made-up
// sample data, no network, nothing is ever saved. Reads answer from the data
// below (or empty); every write answers GUEST_MESSAGE.
//
// Only the calls the app makes are here: rpc, from, storage, auth,
// functions, channel.
import { GUEST_MESSAGE } from './guestMode'

const VIEW_ONLY = { message: GUEST_MESSAGE }

// calls that only read: anything else is a change and is refused
const READS = /^(list_|get_|admin_list_|supplier_list_|supplier_take_|unread_|reset_email_|admin_receipt_notes|admin_reorder_candidates|my_)/

export function createDemoClient(role) {
  const label = { admin: 'Owner', manager: 'Manager', staff: 'Staff', cashier: 'Cashier', supplier: 'Supplier' }[role] || 'Guest'
  const day = 864e5
  const now = Date.now()

  const names = [
    ['Cement 40kg', 'Masonry', 3], ['Steel nails 2"', 'Fasteners', 0], ['PVC pipe 1/2"', 'Plumbing', 7],
    ['Paint brush set', 'Paint', 42], ['Hammer, claw 16oz', 'Tools', 18], ['Wood glue 500ml', 'Adhesives', 9],
    ['Electrical tape', 'Electrical', 64], ['GI wire #16', 'Hardware', 25],
  ]
  const products = names.map(([name, category, quantity], i) => ({
    id: i + 1, name, category, quantity, image_url: '', price: 100 + i * 35,
    inspection_date: i < 3 ? new Date(now + (i - 1) * day).toISOString().slice(0, 10) : null,
    inspection_qty: 20, approved_count: i * 6, return_count: i === 2 ? 1 : 0, is_archived: false,
  }))

  const sales = []
  for (let d = 0; d < 20; d++) {
    for (let k = 0; k < 2 + (d * 7) % 5; k++) {
      const p = products[(d + k) % products.length]
      const qty = 1 + ((d + k) % 4)
      sales.push({
        id: sales.length + 1, created_at: new Date(now - d * day - k * 36e5 - 60000).toISOString(),
        total_amount: p.price * qty, cashier_name: 'Juan Dela Cruz',
        sale_items: [{ product_id: p.id, product_name: p.name, quantity: qty, price: p.price, subtotal: p.price * qty }],
      })
    }
  }

  // Stock history: a few changes per product, ending at today's stock
  const STAFF = ['Guest Owner', 'Steve Cruz', 'Juan Dela Cruz', 'Ria Manager']
  const STEPS = [
    { reason: 'Sale', change: -2, by: 2 },
    { reason: 'Receipt approved', change: 20, by: 0 },
    { reason: 'Sale', change: -1, by: 2 },
    { reason: 'Inspection return', change: -3, by: 1 },
    { reason: 'Stock added', change: 12, by: 3 },
    { reason: 'Quantity edited', change: 2, by: 0 },
    { reason: 'Sale', change: -4, by: 2 },
  ]
  const movements = []
  products.forEach((product, i) => {
    let after = product.quantity
    for (let k = 0; k < STEPS.length; k++) {
      const step = STEPS[(i + k) % STEPS.length]
      // never below zero: an addition bigger than the stock after it is
      // shown as a sale instead (stock before = after + the pieces sold)
      const tooBig = after - step.change < 0
      const change = tooBig ? -2 : step.change
      const reason = tooBig ? 'Sale' : step.reason
      const before = after - change
      movements.push({
        id: movements.length + 1,
        created_at: new Date(now - (i * 5 + k * 19 + 1) * 36e5).toISOString(),
        product_id: product.id, product_name: product.name,
        change, old_quantity: before, new_quantity: after, reason,
        changed_by_name: STAFF[tooBig ? 2 : step.by], recorded_by_name: STAFF[tooBig ? 2 : step.by],
      })
      after = before
    }
    movements.push({
      id: movements.length + 1,
      created_at: new Date(now - (i * 5 + STEPS.length * 19 + 4) * 36e5).toISOString(),
      product_id: product.id, product_name: product.name,
      change: after, old_quantity: 0, new_quantity: after, reason: 'New product',
      changed_by_name: STAFF[0], recorded_by_name: STAFF[0],
    })
  })
  movements.sort((a, b) => b.created_at.localeCompare(a.created_at))

  // The bell: a few notifications for the role, worded like the real ones
  // (the database's notify calls). The unread number is counted from them:
  // a fixed 3 beside an empty list read as "3 new, you're all caught up".
  const ago = (ms) => new Date(now - ms).toISOString()
  const pesos = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const monthDay = (ms) => new Date(now - ms).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
  const NOTICES = {
    admin: [
      { type: 'low_stock', title: 'Out of Stock', message: 'Steel nails 2" is out of stock.', created_at: ago(12e5) },
      { type: 'supplier_upload', title: 'New supplier upload', message: 'Hardware Depot uploaded receipt-nov-01-hardware-depot.jpg', created_at: ago(36e5) },
      { type: 'inspection_approval', title: 'Inspection Approval Request', message: 'Umbrella Nails (2 inches) has 3 item(s) waiting for admin approval.', created_at: ago(day) },
      { type: 'low_stock', title: 'Low Stock', message: 'Cement 40kg is down to 3 left (alert at 10).', created_at: ago(day + 3 * 36e5), is_read: true },
      { type: 'sale', title: 'New Sale Completed', message: `Juan Dela Cruz completed sale #${sales[2].id} worth ₱${pesos(sales[2].total_amount)}.`, created_at: sales[2].created_at, is_read: true },
    ],
    cashier: [
      { type: 'low_stock', title: 'Out of Stock', message: 'Steel nails 2" is out of stock.', created_at: ago(12e5) },
      { type: 'low_stock', title: 'Low Stock', message: 'Cement 40kg is down to 3 left (alert at 10).', created_at: ago(day + 3 * 36e5) },
      { type: 'low_stock', title: 'Low Stock', message: 'PVC pipe 1/2" is down to 7 left (alert at 10).', created_at: ago(2 * day) },
    ],
    staff: [
      { type: 'receive', title: 'Delivery to receive', message: `Steve Cruz will receive receipt-nov-03-depot.jpg now, expected ${monthDay(2 * day)}.`, created_at: ago(3 * day) },
      { type: 'inspection', title: 'Inspection Scheduled', message: 'Cement 40kg is scheduled for inspection.', created_at: ago(5 * 36e5) },
      { type: 'receipt', title: 'Receipt approved', message: 'The owner approved receipt-depot.jpg (from Hardware Depot), uploaded by Steve Cruz. It goes to the receipt scanner.', created_at: ago(day) },
      { type: 'inspection', title: 'Inspection Scheduled', message: 'PVC pipe 1/2" is scheduled for inspection.', created_at: ago(2 * day), is_read: true },
    ],
  }
  // Documentation: one record of each kind (lib/documentTypes.js), worded
  // like the database's own. The staff page shows the ones staff made.
  const documents = [
    { id: 905, type: 'Inspection Document', title: 'Inspection Result - PVC pipe 1/2"', product_name: 'PVC pipe 1/2"', created_by: 'Guest Staff', created_at: ago(day),
      description: `PVC pipe 1/2" was inspected and approved on ${new Date(now - day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.\nResult: Approved with returns\nApproved: 12\nReturn: 1\nTotal inspected: 13\nInspected by: Guest Staff\nCategory: Plumbing` },
    { id: 904, type: 'Product Report', title: 'Damaged Item: Paint brush set', product_name: 'Paint brush set', created_by: 'Guest Staff', created_at: ago(5 * 36e5),
      description: 'Reported by Guest Staff. Issue: Damaged Item. Details: Two sets have broken handles. Kept them apart on the bottom shelf.' },
    { id: 903, type: 'Staff Documentation', title: 'Stockroom count, aisle 3', product_name: '', created_by: 'Guest Staff', created_at: ago(2 * day),
      description: 'Counted the nails and wires in aisle 3. Two boxes of 2" nails were wet, so they are on the top shelf now.' },
    { id: 902, type: 'Inspection Note', title: 'Cement bags at the door', product_name: 'Cement 40kg', created_by: 'Guest Staff', created_at: ago(3 * day),
      description: 'Three bags are torn at the corner. Set aside for the owner to check before they are sold.' },
    { id: 901, type: 'Order Receipt', title: 'Order Receipt - Hardware Depot', product_name: 'Cement 40kg', created_by: 'Guest Owner', created_at: ago(4 * day),
      description: 'Receipt from Hardware Depot: 20 bags of Cement 40kg.' },
  ]

  const notifications = (NOTICES[role === 'manager' ? 'admin' : role] || [])
    .map((notice, i) => ({ id: 9000 - i, recipient_role: role === 'manager' ? 'admin' : role, is_read: false, ...notice }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const data = {
    get_my_profile: { id: 'guest', role, is_active: true, is_hidden: false, email: 'guest@example.com', full_name: `Guest ${label}` },
    // the server reads a Manager as the Owner (get_my_role)
    get_my_role: role === 'manager' ? 'admin' : role,
    list_notifications: notifications,
    unread_notification_count: notifications.filter((notice) => !notice.is_read).length,
    list_documentations: documents,
    list_documentations_by_author: documents.filter((doc) => doc.created_by === 'Guest Staff'),
    // orders to suppliers (lib/orders.js): one waiting, one accepted
    admin_list_purchase_orders: [
      { id: 2, supplier_name: 'JM Supply', supplier_email: 'jm@example.com', created_at: ago(36e5), created_by_name: 'Guest Owner',
        order_status: 'requested', status: 'sent', sent_at: ago(36e5), note: 'Deliver before Friday please',
        items: [{ product_name: 'Cement 40kg', qty: 20 }, { product_name: 'Steel nails 2"', qty: 50 }] },
      { id: 1, supplier_name: 'Hardware Depot', supplier_email: 'depot@example.com', created_at: ago(2 * day), created_by_name: 'Ria Manager',
        order_status: 'accepted', status: 'sent', sent_at: ago(2 * day), expected_date: new Date(now + day).toISOString().slice(0, 10),
        supplier_reply: 'Coming on our Thursday truck', items: [{ product_name: 'PVC pipe 1/2"', qty: 13 }] },
    ],
    supplier_list_my_orders: [
      { id: 2, created_at: ago(36e5), ordered_by: 'Guest Owner', note: 'Deliver before Friday please', order_status: 'requested',
        items: [{ product_name: 'Cement 40kg', qty: 20 }, { product_name: 'Steel nails 2"', qty: 50 }] },
      { id: 1, created_at: ago(2 * day), ordered_by: 'Ria Manager', order_status: 'accepted', expected_date: new Date(now + day).toISOString().slice(0, 10),
        supplier_reply: 'Coming on our Thursday truck', items: [{ product_name: 'PVC pipe 1/2"', qty: 13 }] },
    ],
    admin_reorder_candidates: {
      products: products.filter((p) => p.quantity <= 10).map((p, i) => ({
        ...p, supplier_id: i % 2 ? 'u6' : null, supplier_name: i % 2 ? 'JM Supply' : null, supplier_email: i % 2 ? 'jm@example.com' : null,
      })),
      suppliers: [{ id: 'u6', name: 'JM Supply', email: 'jm@example.com' }, { id: 'u7', name: 'Hardware Depot', email: 'depot@example.com' }],
    },
    list_products: products,
    list_all_sales: sales,
    list_my_sales: sales,
    admin_list_supplier_uploads: [
      { id: 11, file_name: 'receipt-nov-01-hardware-depot.jpg', supplier_name: 'Hardware Depot', created_at: new Date(now - 36e5).toISOString(), file_path: 's/a.jpg' },
      { id: 12, file_name: 'IMG_20261106_0912.jpg', supplier_name: 'JM Supply', uploader_role: 'staff', uploader_name: 'Steve Cruz', note: '2 boxes still on the truck', created_at: new Date(now - 2 * day).toISOString(), file_path: 's/b.jpg' },
    ],
    list_submitted_approvals: [
      { id: 21, product_name: 'Umbrella Nails (2 inches)', requested_by: 'Steve', created_at: new Date(now - day).toISOString(), approved_qty: 3, return_qty: 0 },
      { id: 22, product_name: 'PVC pipe 1/2"', requested_by: 'Ana', created_at: new Date(now - 3 * day).toISOString(), approved_qty: 12, return_qty: 1 },
    ],
    admin_list_activity: [
      { id: 6, created_at: new Date(now - 9e5).toISOString(), actor_name: 'Guest Owner', actor_role: 'admin', action: 'updated', entity: 'product', entity_id: '3', entity_name: 'Cement 40kg', details: { price: { from: 270, to: 280 } } },
      { id: 5, created_at: new Date(now - 2 * 36e5).toISOString(), actor_name: 'Ria Manager', actor_role: 'manager', action: 'updated', entity: 'refund', entity_id: '2', entity_name: null, details: { status: { from: 'pending', to: 'approved' } } },
      { id: 4, created_at: new Date(now - 5 * 36e5).toISOString(), actor_name: 'Steve Cruz', actor_role: 'staff', action: 'created', entity: 'receipt', entity_id: '61', entity_name: 'JM Supply', details: { status: 'pending' } },
      { id: 3, created_at: new Date(now - day).toISOString(), actor_name: 'Guest Owner', actor_role: 'admin', action: 'updated', entity: 'product', entity_id: '9', entity_name: 'Paint brush 2"', details: { is_archived: { from: false, to: true } } },
      { id: 2, created_at: new Date(now - 2 * day).toISOString(), actor_name: 'Guest Owner', actor_role: 'admin', action: 'created', entity: 'account', entity_id: 'u5', entity_name: 'Ria Manager', details: { role: 'manager' } },
      { id: 1, created_at: new Date(now - 3 * day).toISOString(), actor_name: 'Guest Owner', actor_role: 'admin', action: 'downloaded', entity: 'backup', details: { products: 24, sales: 130 } },
    ],
    admin_list_users: [
      { id: 'u1', full_name: 'Guest Owner', email: 'owner@example.com', role: 'admin', is_active: true, account_no: '000000001' },
      { id: 'u8', full_name: 'Ria Manager', email: 'ria@example.com', role: 'manager', is_active: true, account_no: '000000009' },
      { id: 'u2', full_name: 'Steve Cruz', email: 'steve@example.com', role: 'staff', is_active: true, account_no: '000000002' },
      { id: 'u3', full_name: 'Alex Reyes', email: 'alex@example.com', role: 'staff', is_active: true, account_no: '000000004' },
      { id: 'u4', full_name: 'Ian Santos', email: 'ian@example.com', role: 'cashier', is_active: true, account_no: '000000003' },
      { id: 'u5', full_name: 'Mia Lopez', email: 'mia@example.com', role: 'cashier', is_active: true, account_no: '000000005' },
      { id: 'u6', full_name: 'JM Supply', email: 'jm@example.com', role: 'supplier', is_active: true, account_no: '000000007' },
      { id: 'u7', full_name: 'Hardware Depot', email: 'depot@example.com', role: 'supplier', is_active: true, account_no: '000000008' },
    ],
    get_store_logo: null,
    list_receipt_supplier_names: [{ name: 'Hardware Depot' }, { name: 'JM Supply' }, { name: 'Shark Philippines' }],
    list_my_receipt_uploads: [
      { id: 61, file_name: 'IMG_20261106_0912.jpg', file_path: null, status: 'pending', created_at: new Date(now - 18e5).toISOString(), supplier_name: 'JM Supply', note: '2 boxes still on the truck' },
      { id: 58, file_name: 'receipt-depot.jpg', file_path: null, status: 'approved', forwarded_at: new Date(now - 3 * 36e5).toISOString(), created_at: new Date(now - 4 * 36e5).toISOString(), supplier_name: 'Hardware Depot', added: true, products_added: 4 },
      { id: 55, file_name: 'scan-0042.pdf', file_path: null, status: 'approved', forwarded_at: new Date(now - day).toISOString(), created_at: new Date(now - day).toISOString(), supplier_name: 'Shark Philippines', added: false },
      { id: 51, file_name: 'blurry.jpg', file_path: null, status: 'rejected', created_at: new Date(now - 2 * day).toISOString(), supplier_name: 'JM Supply' },
    ],
    admin_list_refunds: [
      { id: 3, sale_id: 128, amount: 516, status: 'pending', requested_by_name: 'Ian Santos', created_at: new Date(now - 9e5).toISOString(), sale_created_at: new Date(now - 2 * day).toISOString(), note: 'Faucet leaks, customer has the receipt',
        items: [ { id: 1, sale_item_id: 11, product_name: 'Shark SF2210 Gooseneck Faucet', quantity: 1, price: 429, amount: 429 }, { id: 2, sale_item_id: 12, product_name: 'Teflon tape', quantity: 3, price: 29, amount: 87 } ] },
      { id: 2, sale_id: 120, amount: 280, status: 'approved', requested_by_name: 'Mia Lopez', created_at: new Date(now - 3 * day).toISOString(), decided_at: new Date(now - 3 * day).toISOString(), items: [ { id: 3, sale_item_id: 9, product_name: 'Cement 40kg', quantity: 1, price: 280, amount: 280 } ] },
      { id: 1, sale_id: 119, amount: 120, status: 'rejected', requested_by_name: 'Ian Santos', reject_reason: 'Opened and used', created_at: new Date(now - 4 * day).toISOString(), decided_at: new Date(now - 4 * day).toISOString(), items: [ { id: 4, sale_item_id: 8, product_name: 'Paint brush 2"', quantity: 2, price: 60, amount: 120 } ] },
    ],
    list_my_refunds: [
      { id: 1, sale_id: 119, amount: 120, status: 'rejected', reject_reason: 'Opened and used', items: [ { id: 4, sale_item_id: 8, product_name: 'Paint brush 2"', quantity: 2, price: 60, amount: 120 } ] },
    ],
    list_my_sales_since: [
      { id: 128, created_at: new Date(now - 2 * day).toISOString(), total_amount: 945, refunded_amount: 0, sale_items: [
        { id: 11, product_name: 'Shark SF2210 Gooseneck Faucet', quantity: 2, price: 429, subtotal: 858, refunded_qty: 0 },
        { id: 12, product_name: 'Teflon tape', quantity: 3, price: 29, subtotal: 87, refunded_qty: 0 } ] },
      { id: 120, created_at: new Date(now - 3 * day).toISOString(), total_amount: 280, refunded_amount: 280, sale_items: [
        { id: 9, product_name: 'Cement 40kg', quantity: 1, price: 280, subtotal: 280, refunded_qty: 1 } ] },
    ],
    admin_list_receivings: [
      { id: 7, receipt_ref: '41', file_name: 'receipt-nov-02-shark.jpg', supplier_name: 'JM Supply', assigned_to: 'u2', assigned_name: 'Steve Cruz', expected_date: new Date(now).toISOString().slice(0, 10), status: 'received', received_by: 'u2', received_by_name: 'Steve Cruz', received_at: new Date(now - 36e5).toISOString(), stock_added_at: new Date(now - 36e5).toISOString(), added_pieces: 20, receive_note: 'Box 2 was wet', note: 'Check the faucets for damage',
        items: [
          { id: 1, product_name: 'Shark SF2210 Gooseneck K.Faucet Vertical Tap', is_new: false, expected_qty: 4, received_qty: 4, price: 858, note: null },
          { id: 2, product_name: 'Shark SF2240 Kitchen Faucet Flex.Head V.Tap', is_new: false, expected_qty: 5, received_qty: 3, price: 1617, note: '2 damaged' },
          { id: 3, product_name: 'Shark SF2771 Brass Ball Valve 3/4" (x8)', is_new: true, expected_qty: 13, received_qty: 13, price: 423.5, note: null },
        ] },
      { id: 8, receipt_ref: '42', file_name: 'receipt-nov-03-depot.jpg', supplier_name: 'Hardware Depot', assigned_to: 'u2', assigned_name: 'Steve Cruz', expected_date: new Date(now - 2 * day).toISOString().slice(0, 10), status: 'waiting', items: [
          { id: 4, product_name: 'Cement 40kg', is_new: false, expected_qty: 20, received_qty: null, price: 280 } ] },
    ],
    list_my_receivings: [
      { id: 8, receipt_ref: '42', file_name: 'receipt-nov-03-depot.jpg', supplier_name: 'Hardware Depot', assigned_name: 'Steve Cruz', expected_date: new Date(now - 2 * day).toISOString().slice(0, 10), status: 'waiting', note: 'Count the bags, two may be torn', items: [
          { id: 4, product_name: 'Cement 40kg', is_new: false, expected_qty: 20, received_qty: null },
          { id: 5, product_name: 'Steel nails 2"', is_new: false, expected_qty: 50, received_qty: null } ] },
      { id: 7, receipt_ref: '41', file_name: 'receipt-nov-02-shark.jpg', supplier_name: 'JM Supply', assigned_to: 'u1', assigned_name: 'Steve Cruz', received_by: 'u9', received_by_name: 'Karl Velasco', received_at: new Date(now - 5e6).toISOString(), expected_date: new Date(now).toISOString().slice(0, 10), status: 'received', items: [
          { id: 1, product_name: 'Shark SF2210 Gooseneck', is_new: false, expected_qty: 4, received_qty: 4 } ] },
    ],
    supplier_take_new_receipt_results: [
      { upload_id: 31, file_name: 'receipt-nov-02-jm-supply.jpg', products: 5, pieces: 120, confirmed_at: new Date(now - 6e5).toISOString() },
    ],
    supplier_list_my_uploads: [
      { id: 31, file_name: 'receipt-nov-02-jm-supply.jpg', status: 'approved', forwarded_at: new Date(now - 36e5).toISOString(), created_at: new Date(now - 2 * 36e5).toISOString() },
      { id: 30, file_name: 'receipt-nov-01.jpg', status: 'approved', forwarded_at: new Date(now - day).toISOString(), created_at: new Date(now - day).toISOString() },
      { id: 29, file_name: 'receipt-oct-31.jpg', status: 'pending', created_at: new Date(now - 2 * day).toISOString(), file_path: 'x/y.jpg' },
    ],
    supplier_list_receipt_results: [
      { upload_id: 31, product_name: 'Cement 40kg', qty_added: 20, is_new: false, confirmed_at: new Date(now - 6e5).toISOString() },
      { upload_id: 31, product_name: 'Steel nails 2"', qty_added: 50, is_new: false, confirmed_at: new Date(now - 6e5).toISOString() },
      { upload_id: 31, product_name: 'Umbrella Nails (2 inches)', qty_added: 30, is_new: true, confirmed_at: new Date(now - 6e5).toISOString() },
      { upload_id: 31, product_name: 'Wood glue 500ml', qty_added: 12, is_new: false, confirmed_at: new Date(now - 6e5).toISOString() },
      { upload_id: 31, product_name: 'GI wire #16', qty_added: 8, is_new: false, confirmed_at: new Date(now - 6e5).toISOString() },
    ],
    list_disabled_products: [{ id: 2, reason: 'Damaged or defective', disabled_at: new Date().toISOString(), disabled_by_name: 'Juan Dela Cruz' }],
    list_deliveries: [
      { id: 1, title: 'Cement delivery', delivery_date: new Date(now - 2 * day).toISOString().slice(0, 10), status: 'pending', supplier: 'JM Supply' },
      { id: 2, title: 'Paint restock', delivery_date: new Date(now + 3 * day).toISOString().slice(0, 10), status: 'pending', supplier: 'Hardware Depot' },
      { id: 3, title: 'GI wire order', delivery_date: new Date(now - day).toISOString().slice(0, 10), status: 'Delivered', needs_receipt: true, receipt_state: 'waiting', supplier: 'JM Supply' },
      { id: 4, title: 'Faucets', delivery_date: new Date(now - day).toISOString().slice(0, 10), status: 'Delivered', needs_receipt: true, upload_id: 12, receipt_state: 'sent', receipt_file: 'IMG_20261106_0912.jpg', supplier: 'Shark Philippines' },
    ],
    list_active_approvals: [],
    admin_list_receipt_review: [],
    admin_list_unsent_supplier_uploads: [],
  }

  // Documentation > Refunded: the refunds that went through (lib/refunds.js)
  data.admin_list_refund_documents = data.admin_list_refunds.filter((refund) => refund.status === 'approved')

  // supabase.from(...).select()...: reads give [], a change is refused
  const query = () => {
    let writes = false
    const proxy = new Proxy(function () {}, {
      get(_, key) {
        if (key === 'then') {
          return (resolve) => resolve(writes ? { data: null, error: VIEW_ONLY } : { data: [], error: null, count: 0 })
        }
        if (['insert', 'update', 'upsert', 'delete'].includes(key)) writes = true
        return () => proxy
      },
      apply: () => proxy,
    })
    return proxy
  }

  const session = {
    access_token: 'guest',
    user: { id: 'guest', email: 'guest@example.com', app_metadata: { guest: true }, user_metadata: {} },
  }
  const channel = { on() { return channel }, subscribe() { return channel }, unsubscribe() {} }
  const refuse = async () => ({ data: null, error: VIEW_ONLY })

  return {
    isDemo: true,
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: refuse,
      updateUser: refuse,
      resetPasswordForEmail: refuse,
      verifyOtp: refuse,
      // logging out ends guest mode (the page asks lib/guestMode to)
      signOut: async () => ({ error: null }),
    },
    rpc: async (name, args = {}) => {
      if (name === 'list_stock_movements') {
        const rows = args.p_product_id ? movements.filter((m) => m.product_id === args.p_product_id) : movements
        return { data: rows, error: null }
      }
      // approved receipts (Documentation > Order Receipt): one, read by the scanner
      if (name === 'admin_list_supplier_uploads' && args.p_status === 'approved') {
        return { data: [{ id: 41, file_name: 'receipt-nov-02-shark.jpg', file_path: '', status: 'approved', supplier_name: 'JM Supply',
          uploader_name: 'JM Supply', uploader_role: 'supplier', delivery_title: 'Faucets', note: 'Check the faucets for damage',
          created_at: new Date(now - 2 * day).toISOString(), reviewed_at: new Date(now - 2 * day + 36e5).toISOString(), forwarded_at: new Date(now - 2 * day + 37e5).toISOString() }], error: null }
      }
      if (name === 'admin_list_supplier_uploads' && args.p_status && args.p_status !== 'pending') return { data: [], error: null }
      if (name === 'admin_list_receipt_results') {
        return { data: [
          { upload_id: 41, product_name: 'Shark SF2210 Gooseneck K.Faucet Vertical Tap', qty_added: 4, cost: 715, price: 858, is_new: false, state: 'added' },
          { upload_id: 41, product_name: 'Shark SF2240 Kitchen Faucet Flex.Head V.Tap', qty_added: 3, cost: 1347.5, price: 1617, is_new: false, state: 'added' },
          { upload_id: 41, product_name: 'Shark SF2771 Brass Ball Valve 3/4"', qty_added: 13, cost: 352.92, price: 423.5, is_new: true, state: 'added' },
        ], error: null }
      }
      if (name in data) return { data: data[name], error: null }
      if (READS.test(name)) return { data: name.startsWith('get_') || name.startsWith('unread_') ? null : [], error: null }
      return { data: null, error: VIEW_ONLY }
    },
    from: () => query(),
    functions: { invoke: refuse },
    channel: () => channel,
    removeChannel: () => {},
    removeAllChannels: () => {},
    storage: {
      from: () => ({
        getPublicUrl: (path) => ({ data: { publicUrl: '/' + path } }),
        createSignedUrls: async () => ({ data: [], error: null }),
        createSignedUrl: async () => ({ data: null, error: null }),
        download: refuse,
        list: async () => ({ data: [], error: null }),
        upload: refuse,
        update: refuse,
        copy: refuse,
        move: refuse,
        remove: refuse,
      }),
    },
  }
}
