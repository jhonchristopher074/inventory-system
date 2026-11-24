// Order requests to suppliers (migration 20261125000001_order_requests.sql,
// Edge Function send-order-email).
//
// The Owner or Manager sends an order from Inventory > Low stock >
// Reorder; the supplier sees it in the Drop Box (Orders) and gets an email;
// the supplier accepts it with a delivery date (it goes on the Calendar) or
// declines it; the Owner or Manager closes it once the goods are in.
//
//   order_status  requested | accepted | declined | cancelled | completed
//   status        the email: to_send | sent | failed | cancelled
import { supabase } from './supabase'
import { isMissingSql } from './receiving'

export const NOT_SET_UP = 'Orders are not set up yet: run 20261125000001_order_requests.sql in Supabase.'

async function call(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) {
    const missing = isMissingSql(error)
    throw Object.assign(new Error(missing ? NOT_SET_UP : error.message || 'Something went wrong. Try again.'), {
      missingSql: missing,
    })
  }
  return data
}

// Emails the order (Resend). Never throws: { sent, reason }.
async function emailOrder(orderId) {
  try {
    const { data, error } = await supabase.functions.invoke('send-order-email', { body: { order_id: orderId } })
    if (error) {
      let reason = error.message || 'The email could not be sent'
      // the function's own answer, when it gave one
      try {
        const body = await error.context?.json?.()
        if (body?.reason) reason = body.reason
      } catch {
        // keep the plain reason
      }
      return { sent: false, reason }
    }
    return { sent: Boolean(data?.sent), reason: data?.reason || '' }
  } catch (err) {
    return { sent: false, reason: err.message || 'The email could not be sent' }
  }
}

/* ---- Owner and Manager ---- */

// items: [{ product_id, qty }]. Returns { order, sent, reason }.
export async function sendOrder(supplierId, items, note = '') {
  const order = await call('admin_create_purchase_order', {
    p_supplier_id: supplierId,
    p_items: items,
    p_note: note || null,
  })
  const email = await emailOrder(order.id)
  return { order, ...email }
}

// [] until the SQL is run
export async function listOrders() {
  try {
    return { ready: true, list: (await call('admin_list_purchase_orders')) || [] }
  } catch (err) {
    if (err.missingSql) return { ready: false, list: [] }
    throw err
  }
}

export function cancelOrder(orderId) {
  return call('admin_cancel_purchase_order', { p_order_id: orderId })
}

export function completeOrder(orderId) {
  return call('admin_complete_purchase_order', { p_order_id: orderId })
}

// the email failed: try again
export async function resendOrderEmail(orderId) {
  await call('admin_retry_purchase_order', { p_order_id: orderId })
  return emailOrder(orderId)
}

/* ---- Supplier ---- */

export async function listMyOrders() {
  try {
    return { ready: true, list: (await call('supplier_list_my_orders')) || [] }
  } catch (err) {
    if (err.missingSql) return { ready: false, list: [] }
    throw err
  }
}

export function respondOrder(orderId, accept, date = null, reply = '') {
  return call('supplier_respond_order', {
    p_order_id: orderId,
    p_accept: accept,
    p_date: date || null,
    p_reply: reply || null,
  })
}

/* ---- words and colours, the same on both sides ---- */
export const ORDER_STATES = {
  requested: { label: 'Waiting for the supplier', short: 'Requested', tone: 'bg-sky-500/15 text-sky-300' },
  accepted: { label: 'Accepted', short: 'Accepted', tone: 'bg-emerald-500/15 text-emerald-400' },
  declined: { label: 'Declined', short: 'Declined', tone: 'bg-red-600/15 text-red-400' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'bg-zinc-700/60 text-zinc-300' },
  completed: { label: 'Completed', short: 'Completed', tone: 'bg-violet-500/15 text-violet-300' },
}

export function orderPieces(order) {
  return (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)
}
