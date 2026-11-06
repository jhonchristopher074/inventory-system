// What's waiting for the person logged in: the numbers on the sidebar
// (and on the Calendar tabs and the browser tab), so nobody has to open
// every page to find out there's work. Same rules as the dashboards.
//
//   owner   Approval     receipts to approve, prices to check, receipts not
//                        sent, inspections to approve
//           Calendar     overdue inspections and deliveries, deliveries
//                        that arrived without their receipt
//           Inventory    products running low (alert orange)
//           Sales History refund requests left from before
//   staff   Inspection Calendar  inspections due (today or overdue) and
//                        deliveries due (yours to receive included)
//
// App.vue refreshes it on every page change, every minute, back on the tab,
// and when a notification arrives (NotificationBell). A list that fails to
// load keeps its last number.
import { reactive } from 'vue'
import { supabase } from './supabase'
import { heldProductIds, withoutHeld } from './heldProducts'
import { isLowStock } from './stock'
import { isDelivered } from './deliveries'
import { dayKey } from './dashboardStats'

// path -> { n, tone: 'task' | 'alert', hint }, and the Calendar tabs
export const taskBadges = reactive({ byPath: {}, tabs: {}, total: 0 })

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data || []
}

function plural(n, word, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`
}

function hintOf(parts) {
  return parts.filter(([n]) => n > 0).map(([n, word, many]) => plural(n, word, many)).join(' · ')
}

/* ---- inspections, by the Staff Calendar's rules ---- */
function inspectionRows(products, approvals, today) {
  const pending = new Map()
  for (const approval of approvals) {
    if (approval.status !== 'saved' && approval.status !== 'submitted') continue
    const pieces = Number(approval.approved_qty || 0) + Number(approval.return_qty || 0)
    pending.set(approval.product_id, (pending.get(approval.product_id) || 0) + pieces)
  }

  return products
    .filter((product) => product.inspection_date)
    .map((product) => {
      const date = String(product.inspection_date).slice(0, 10)
      const qty = Number(product.inspection_qty ?? product.quantity ?? 0)
      const done =
        Number(product.approved_count || 0) + Number(product.return_count || 0) + (pending.get(product.id) || 0)
      return { date, remaining: Math.max(qty - done, 0), overdue: date < today && done < qty }
    })
}

function deliveryDates(deliveries) {
  return deliveries
    .filter((delivery) => !isDelivered(delivery))
    .map((delivery) => (delivery.delivery_date ? String(delivery.delivery_date).slice(0, 10) : ''))
}

/* ---- per role ---- */
async function forOwner(last) {
  const today = dayKey(new Date())
  const [uploads, review, unsent, inspections, receivings, products, approvals, deliveries, refunds, held] =
    await Promise.allSettled([
      rpc('admin_list_supplier_uploads', { p_status: 'pending' }),
      rpc('admin_list_receipt_review'),
      rpc('admin_list_unsent_supplier_uploads'),
      rpc('list_submitted_approvals'),
      rpc('admin_list_receivings'),
      rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
      rpc('list_active_approvals'),
      rpc('list_deliveries'),
      rpc('admin_list_refunds'),
      heldProductIds(),
    ])
  const ok = (result) => result.status === 'fulfilled'

  // Approval (receipts waiting for their delivery aren't "prices to check")
  const awaited = new Set(
    ok(receivings)
      ? receivings.value.filter((d) => d.status === 'waiting').map((d) => String(d.receipt_ref))
      : []
  )
  const toApprove = ok(uploads) ? uploads.value.length : null
  const toPrice = ok(review)
    ? new Set(review.value.filter((i) => !awaited.has(String(i.upload_ref))).map((i) => i.upload_ref || 'other')).size
    : null
  const notSent = ok(unsent) ? unsent.value.length : null
  const toInspect = ok(inspections) ? inspections.value.length : null

  const approval = { ...(last['/approval'] || {}) }
  if ([toApprove, toPrice, notSent, toInspect].every((n) => n !== null)) {
    approval.n = toApprove + toPrice + notSent + toInspect
    approval.hint = hintOf([
      [toApprove, 'receipt to approve', 'receipts to approve'],
      [toPrice, 'receipt with prices to check', 'receipts with prices to check'],
      [notSent, 'receipt not sent', 'receipts not sent'],
      [toInspect, 'inspection to approve', 'inspections to approve'],
    ])
    approval.tone = 'task'
  }

  // Calendar: what's late
  const byPath = { '/approval': approval }
  if (ok(products) && ok(approvals) && ok(deliveries)) {
    const lateInspections = inspectionRows(products.value, approvals.value, today).filter((r) => r.overdue).length
    const lateDeliveries = deliveryDates(deliveries.value).filter((date) => date && date < today).length
    // arrived without their receipt: no stock until it's in
    const noReceipt = deliveries.value.filter((d) => d.receipt_state === 'waiting').length
    byPath['/calendar'] = {
      n: lateInspections + lateDeliveries + noReceipt,
      tone: 'task',
      hint: hintOf([
        [lateInspections, 'inspection overdue', 'inspections overdue'],
        [lateDeliveries, 'delivery overdue', 'deliveries overdue'],
        [noReceipt, 'delivery without its receipt', 'deliveries without their receipt'],
      ]),
    }
    taskBadges.tabs['admin:inspection'] = lateInspections
    taskBadges.tabs['admin:delivery'] = lateDeliveries + noReceipt
  } else if (last['/calendar']) {
    byPath['/calendar'] = last['/calendar']
  }

  // Inventory: running low
  if (ok(products)) {
    const list = withoutHeld(products.value, ok(held) ? held.value : new Set())
    const low = list.filter(isLowStock).length
    byPath['/inventory'] = { n: low, tone: 'alert', hint: low ? `${plural(low, 'product')} running low` : '' }
  } else if (last['/inventory']) {
    byPath['/inventory'] = last['/inventory']
  }

  // Sales History: refund requests left from before refunds needed no approval
  if (ok(refunds)) {
    const waiting = refunds.value.filter((r) => r.status === 'pending').length
    byPath['/admin/sales'] = { n: waiting, tone: 'task', hint: waiting ? `${plural(waiting, 'refund')} to approve` : '' }
  }

  return byPath
}

async function forStaff(last) {
  const today = dayKey(new Date())
  const [products, approvals, deliveries, receivings] = await Promise.allSettled([
    rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
    rpc('list_active_approvals'),
    rpc('list_deliveries'),
    rpc('list_my_receivings'),
  ])
  const ok = (result) => result.status === 'fulfilled'
  if (!ok(products) || !ok(approvals) || !ok(deliveries)) return { '/staff/calendar': last['/staff/calendar'] }

  const due = inspectionRows(products.value, approvals.value, today).filter((r) => r.date <= today && r.remaining > 0).length
  const deliveriesDue = deliveryDates(deliveries.value).filter((date) => date && date <= today).length
  // supplier deliveries the owner gave you, once they're expected
  const toReceive = ok(receivings)
    ? receivings.value.filter((d) => d.status === 'waiting' && (!d.expected_date || String(d.expected_date).slice(0, 10) <= today)).length
    : 0

  taskBadges.tabs['staff:inspection'] = due
  taskBadges.tabs['staff:delivery'] = deliveriesDue + toReceive

  return {
    '/staff/calendar': {
      n: due + deliveriesDue + toReceive,
      tone: 'task',
      hint: hintOf([
        [due, 'inspection to do', 'inspections to do'],
        [deliveriesDue, 'delivery due', 'deliveries due'],
        [toReceive, 'supplier delivery to receive', 'supplier deliveries to receive'],
      ]),
    },
  }
}

const LOADERS = { admin: forOwner, staff: forStaff }

let running = false
let again = false

export async function refreshTasks(role) {
  const load = LOADERS[role]
  if (!load) {
    taskBadges.byPath = {}
    taskBadges.total = 0
    return
  }
  if (running) {
    again = true // one more right after: something changed meanwhile
    return
  }

  running = true
  try {
    const byPath = await load(taskBadges.byPath)
    const clean = {}
    for (const [path, badge] of Object.entries(byPath)) if (badge) clean[path] = badge
    taskBadges.byPath = clean
    // the browser tab counts tasks, not "running low"
    taskBadges.total = Object.values(clean)
      .filter((badge) => badge.tone === 'task')
      .reduce((sum, badge) => sum + (badge.n || 0), 0)
  } catch (err) {
    console.error('Could not count the tasks:', err)
  } finally {
    running = false
    if (again) {
      again = false
      refreshTasks(role)
    }
  }
}

// several triggers at once (a page change and a notification): one refresh
let soonTimer = null
let soonRole = null

export function refreshTasksSoon(role = soonRole) {
  soonRole = role
  clearTimeout(soonTimer)
  soonTimer = setTimeout(() => refreshTasks(soonRole), 500)
}

export function clearTasks() {
  clearTimeout(soonTimer)
  soonRole = null
  taskBadges.byPath = {}
  taskBadges.tabs = {}
  taskBadges.total = 0
}
