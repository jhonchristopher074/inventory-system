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
  const label = { admin: 'Owner', staff: 'Staff', cashier: 'Cashier', supplier: 'Supplier' }[role] || 'Guest'
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

  const data = {
    get_my_profile: { id: 'guest', role, is_active: true, is_hidden: false, email: 'guest@example.com', full_name: `Guest ${label}` },
    get_my_role: role,
    unread_notification_count: 3,
    list_products: products,
    list_all_sales: sales,
    list_my_sales: sales,
    list_my_sales_since: sales,
    admin_list_supplier_uploads: [
      { id: 11, file_name: 'receipt-nov-01-hardware-depot.jpg', supplier_name: 'Hardware Depot', created_at: new Date(now - 36e5).toISOString(), file_path: 's/a.jpg' },
      { id: 12, file_name: 'IMG_20261106_0912.jpg', supplier_name: 'JM Supply', uploader_role: 'staff', uploader_name: 'Steve Cruz', note: '2 boxes still on the truck', created_at: new Date(now - 2 * day).toISOString(), file_path: 's/b.jpg' },
    ],
    list_submitted_approvals: [
      { id: 21, product_name: 'Umbrella Nails (2 inches)', requested_by: 'Steve', created_at: new Date(now - day).toISOString(), approved_qty: 3, return_qty: 0 },
      { id: 22, product_name: 'PVC pipe 1/2"', requested_by: 'Ana', created_at: new Date(now - 3 * day).toISOString(), approved_qty: 12, return_qty: 1 },
    ],
    admin_list_users: [
      { id: 'u1', full_name: 'Guest Owner', email: 'owner@example.com', role: 'admin', is_active: true, account_no: '000000001' },
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
    rpc: async (name) => {
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
