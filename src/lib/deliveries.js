// Delivery schedules (the Calendar's Delivery tab), shared by both
// calendars and the Owner's and Staff dashboards.
//
// Every delivery ends up with its receipt (only a receipt puts stock in):
// supabase/migrations/20261107000001_delivery_receipts.sql. list_deliveries
// says where a delivery's receipt is (receipt_state):
//   none     scheduled, or marked delivered before receipts were linked
//   waiting  the goods came, the receipt didn't yet
//   sent     its receipt is with the owner (approval, scanner, prices)
//   done     its receipt's products are confirmed: the stock is in
import { supabase } from './supabase'

// a delivery whose status says it arrived (any of the words people used)
export function isDelivered(delivery) {
  return ['delivered', 'done', 'completed'].includes(String(delivery?.status || '').trim().toLowerCase())
}

export const RECEIPT_STATES = {
  waiting: { text: 'Arrived · waiting for receipt', tone: 'bg-amber-500/15 text-amber-300' },
  sent: { text: 'Arrived · receipt with the owner', tone: 'bg-sky-500/15 text-sky-300' },
  done: { text: 'Done · stock added', tone: 'bg-emerald-600/15 text-emerald-300' },
}

export function receiptStateOf(delivery) {
  return RECEIPT_STATES[delivery?.receipt_state] || null
}

// still on the calendar: not arrived yet, or arrived but its receipt
// isn't through yet
export function isOpenDelivery(delivery) {
  return !isDelivered(delivery) || delivery.receipt_state === 'waiting' || delivery.receipt_state === 'sent'
}

const SETUP =
  "This needs an update: run supabase/migrations/20261107000001_delivery_receipts.sql in Supabase first."

function explain(error) {
  if (error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''))) return SETUP
  return error?.message || 'Something went wrong. Try again.'
}

// the goods came without their receipt
export async function markArrivedWithoutReceipt(deliveryId) {
  const { error } = await supabase.rpc('mark_delivery_no_receipt', { p_delivery_id: deliveryId })
  if (error) throw new Error(explain(error))
}

// owner: "this receipt is for that delivery"
export async function linkDeliveryReceipt(uploadId, deliveryId) {
  const { error } = await supabase.rpc('admin_link_delivery_receipt', {
    p_upload_id: uploadId,
    p_delivery_id: deliveryId,
  })
  if (error) throw new Error(explain(error))
}
