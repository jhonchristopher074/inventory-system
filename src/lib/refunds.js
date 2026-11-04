// Refunds (supabase/migrations/20261104000001_refund_requests.sql)
//
//   cashier  POS > Refund (or Sales History > a sale): picks the sale, how
//            many of each product came back, and a note -> a request
//   owner    Approval > Refunds: Approve takes it off the sale (sales
//            history and reports) and puts the pieces back in stock;
//            Reject changes nothing
//
// Each call throws an Error with a message for the screen. Until the SQL
// is run, the lists are empty and sending one says what to run.
import { supabase } from './supabase'

export const NOT_SET_UP =
  "Refunds aren't set up yet: run supabase/migrations/20261104000001_refund_requests.sql in Supabase first."

function isMissingSql(error) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''))
}

async function call(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    const missingSql = isMissingSql(error)
    const message = missingSql ? NOT_SET_UP : String(error.message || '') || 'Something went wrong. Try again.'
    throw Object.assign(new Error(message), { missingSql })
  }
  return data
}

async function list(name) {
  try {
    return { ready: true, list: (await call(name)) || [] }
  } catch (err) {
    if (err.missingSql) return { ready: false, list: [] }
    throw err
  }
}

// ---- cashier ----
export const listMyRefunds = () => list('list_my_refunds')

// items: [{ sale_item_id, quantity }]
export function requestRefund(saleId, items, note) {
  return call('cashier_request_refund', { p_sale_id: saleId, p_items: items, p_note: note || null })
}

// ---- owner ----
export const listAllRefunds = () => list('admin_list_refunds')

// every approved refund, for Documentation > Refunded. Until its SQL
// (20261104000003_refund_documents.sql) is run: the ones of the last days.
export async function listRefundDocuments() {
  try {
    return (await call('admin_list_refund_documents')) || []
  } catch (err) {
    if (!err.missingSql) throw err
    return (await listAllRefunds()).list.filter((request) => request.status === 'approved')
  }
}

export function decideRefund(id, approve, reason) {
  return call('admin_decide_refund', { p_request_id: id, p_approve: approve, p_reason: reason || null })
}

// ---- both ----
// sale item id -> pieces already asked for and not decided yet
export function pendingBySaleItem(requests) {
  const pending = new Map()
  for (const request of requests || []) {
    if (request.status !== 'pending') continue
    for (const item of request.items || []) {
      pending.set(String(item.sale_item_id), (pending.get(String(item.sale_item_id)) || 0) + Number(item.quantity))
    }
  }
  return pending
}

// refund history is kept on screen for 7 days (waiting ones always)
const HISTORY_DAYS = 7
export function recent(requests) {
  const since = Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000
  return (requests || []).filter(
    (request) => request.status === 'pending' || new Date(request.decided_at || request.created_at).getTime() >= since
  )
}

// only today's sales can be refunded (the database checks it too)
export function isToday(sale) {
  return new Date(sale?.created_at).toDateString() === new Date().toDateString()
}

export function piecesOf(request) {
  return (request?.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
}

export const STATUS = {
  pending: { text: 'Waiting for the owner', tone: 'bg-amber-500/15 text-amber-300' },
  approved: { text: 'Approved', tone: 'bg-emerald-600/15 text-emerald-300' },
  rejected: { text: 'Rejected', tone: 'bg-red-600/15 text-red-400' },
}
