// Receiving: a supplier's receipt that came before its delivery
// (supabase/migrations/20261102000003_receipt_receiving.sql and
// 20261102000004_receiving_auto_add.sql).
//
//   owner   "Not delivered yet" in Check prices -> picks the staff member
//   staff   Calendar > Delivery: counts what arrived, "Mark as delivered":
//           what arrived goes into stock right away, at the owner's prices
//   owner   gets the details (notification, Approval > Deliveries); can
//           also receive it himself or give it to someone else
//
// Each call throws an Error with a message for the screen. Until the SQL
// is run, the lists are empty and starting one says what to run.
import { supabase } from './supabase'

export const NOT_SET_UP =
  "Receiving isn't set up yet: run supabase/migrations/20261102000003_receipt_receiving.sql in Supabase first."

export function isMissingSql(error) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''))
}

function explain(error) {
  if (isMissingSql(error)) return NOT_SET_UP
  return String(error?.message || '') || 'Something went wrong. Try again.'
}

async function call(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw Object.assign(new Error(explain(error)), { missingSql: isMissingSql(error) })
  return data
}

// ---- owner ----
// { ready: false } when the SQL isn't run (the button stays hidden)
export async function listAllReceivings() {
  try {
    return { ready: true, list: (await call('admin_list_receivings')) || [] }
  } catch (err) {
    if (err.missingSql) return { ready: false, list: [] }
    throw err
  }
}

export function startReceiving({ receiptRef, staffId, expectedDate, note, items }) {
  return call('admin_start_receiving', {
    p_receipt_ref: String(receiptRef),
    p_staff_id: staffId,
    p_expected_date: expectedDate || null,
    p_note: note || null,
    p_items: items, // [{ id, price }]
  })
}

export function reassignReceiving(id, staffId, expectedDate) {
  return call('admin_reassign_receiving', {
    p_delivery_id: id,
    p_staff_id: staffId,
    p_expected_date: expectedDate || null,
  })
}

export function cancelReceiving(id) {
  return call('admin_cancel_receiving', { p_delivery_id: id })
}

// ---- staff (and the owner, receiving it himself) ----
export async function listMyReceivings() {
  try {
    return (await call('list_my_receivings')) || []
  } catch (err) {
    if (err.missingSql) return []
    throw err
  }
}

export function receiveDelivery(id, items, note) {
  return call('staff_receive_delivery', {
    p_delivery_id: id,
    p_items: items, // [{ id, received_qty, note }]
    p_note: note || null,
  })
}

// ---- both ----
export function piecesOf(delivery, field = 'expected_qty') {
  return (delivery?.items || []).reduce((sum, item) => sum + (Number(item[field]) || 0), 0)
}

// pieces that went into stock when it was received
export function addedPieces(delivery) {
  return delivery?.added_pieces ?? piecesOf(delivery, 'received_qty')
}

// products that came short (received < expected)
export function shortItems(delivery) {
  return (delivery?.items || []).filter(
    (item) => item.received_qty != null && Number(item.received_qty) < Number(item.expected_qty)
  )
}

// "Nov 3, 2026" for a date column ("2026-11-03" is a local date, not UTC)
export function dayText(date) {
  if (!date) return ''
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// today as "2026-11-03" on this computer
export function todayKey() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
