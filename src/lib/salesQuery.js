// Sales for Sales History and the dashboards, worked out by the database
// (supabase/migrations/20261121000001_sales_pages.sql), so no page loads
// every sale ever made:
//
//   salesPage(filters, { sort, dir, limit, offset })  { rows, total }
//   salesSummary(filters)   { net, count, items, products, refunded, refundedSales,
//                             firstSale, previousNet, days, top, cashiers }
//   listSales(filters)      every matching sale (downloads, dashboards)
//
// filters: { from: Date|null, to: Date|null (not included), cashier: '', search: '',
//            mine: true on a cashier's own pages }
// The Owner and a Manager get every cashier's sales, a cashier only their own.
//
// Before that SQL is run (and in guest mode) the same answers are worked out
// here, from list_all_sales / list_my_sales.
import { supabase } from './supabase'
import { guestRole } from './guestMode'

/* ---------------- a sale's cashier ---------------- */
export function cashierName(sale) {
  return sale.profiles?.full_name || sale.cashier_name || 'Unknown cashier'
}

// the cashier's id, so two cashiers with the same name are never mixed up
// (the name, for an old sale without one: as the database does it)
export function cashierKey(sale) {
  return String(sale.cashier_id || sale.profiles?.id || cashierName(sale))
}

/* ---------------- the database ---------------- */
const MISSING = /sales_page|sales_summary|schema cache|could not find the function/i
// false once the database says it doesn't have them yet (or in guest mode)
let server = !guestRole()

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila'
  } catch {
    return 'Asia/Manila'
  }
}

function params(f = {}) {
  return {
    p_from: f.from ? f.from.toISOString() : null,
    p_to: f.to ? f.to.toISOString() : null,
    p_cashier: f.cashier || null,
    p_search: String(f.search || '').trim() || null,
  }
}

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (!error) return data
  if (MISSING.test(error.message || '')) {
    server = false
    return undefined
  }
  throw error
}

export async function salesPage(filters = {}, { sort = 'date', dir = 'desc', limit = 10, offset = 0 } = {}) {
  if (server) {
    const data = await call('sales_page', {
      ...params(filters),
      p_sort: sort,
      p_dir: dir,
      p_limit: limit,
      p_offset: offset,
    })
    if (data !== undefined) return { rows: data?.rows || [], total: Number(data?.total) || 0 }
  }
  const list = sorted(matching(await everySale(filters), filters), sort, dir)
  return { rows: limit ? list.slice(offset, offset + limit) : list.slice(offset), total: list.length }
}

export async function salesSummary(filters = {}) {
  if (server) {
    const data = await call('sales_summary', { ...params(filters), p_tz: timeZone() })
    if (data !== undefined) {
      return {
        net: Number(data.net) || 0,
        count: Number(data.count) || 0,
        items: Number(data.items) || 0,
        products: Number(data.products) || 0,
        refunded: Number(data.refunded) || 0,
        refundedSales: Number(data.refunded_sales) || 0,
        firstSale: data.first_sale ? new Date(data.first_sale) : null,
        previousNet: data.previous_net === null || data.previous_net === undefined ? null : Number(data.previous_net),
        days: (data.days || []).map((d) => ({ day: d.day, total: Number(d.total) || 0, count: Number(d.count) || 0 })),
        top: (data.top || []).map((t) => ({ name: t.name, quantity: Number(t.quantity) || 0, total: Number(t.total) || 0 })),
        cashiers: data.cashiers || [],
      }
    }
  }
  return summaryOf(await everySale(filters), filters)
}

export async function listSales(filters = {}) {
  return (await salesPage(filters, { limit: 0 })).rows
}

/* ---------------- before the SQL is run: the same, worked out here ---------------- */
// one load is shared by the calls of the next few seconds (a page asks for
// its rows and its totals at the same time)
const REUSE_MS = 5000
const loads = {}

function everySale(filters) {
  const which = filters.mine ? 'list_my_sales' : 'list_all_sales'
  const load = loads[which]
  if (load && Date.now() - load.at < REUSE_MS) return load.rows

  const rows = supabase.rpc(which).then(({ data, error }) => {
    if (error) throw error
    return data || []
  })
  loads[which] = { at: Date.now(), rows }
  rows.catch(() => delete loads[which])
  return rows
}

function within(sale, from, to) {
  const date = new Date(sale.created_at)
  return (!from || date >= from) && (!to || date < to)
}

function searched(sale, search) {
  const q = String(search || '').trim().toLowerCase().replace(/^#+/, '')
  if (!q) return true
  if (String(sale.id).startsWith(q)) return true
  if (cashierName(sale).toLowerCase().includes(q)) return true
  return (sale.sale_items || []).some((item) => String(item.product_name || '').toLowerCase().includes(q))
}

function matching(sales, filters, from = filters.from, to = filters.to) {
  return sales.filter(
    (sale) =>
      within(sale, from, to) &&
      (!filters.cashier || cashierKey(sale) === filters.cashier) &&
      searched(sale, filters.search)
  )
}

function sorted(list, sort, dir) {
  const sign = dir === 'asc' ? 1 : -1
  const value = (sale) => (sort === 'total' ? Number(sale.total_amount || 0) : new Date(sale.created_at).getTime())
  return [...list].sort((a, b) => sign * (value(a) - value(b)) || sign * (Number(a.id) - Number(b.id)))
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function net(list) {
  return list.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
}

function summaryOf(all, filters) {
  const list = matching(all, filters)
  const items = list.flatMap((sale) => sale.sale_items || [])

  const days = new Map()
  for (const sale of list) {
    const key = dayKey(new Date(sale.created_at))
    const day = days.get(key) || { day: key, total: 0, count: 0 }
    day.total += Number(sale.total_amount || 0)
    day.count += 1
    days.set(key, day)
  }

  const products = new Map()
  for (const item of items) {
    const name = item.product_name || 'Unknown product'
    const row = products.get(name) || { name, quantity: 0, total: 0 }
    row.quantity += Number(item.quantity || 0)
    row.total += Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))
    products.set(name, row)
  }

  let previousNet = null
  if (filters.from) {
    const length = (filters.to || new Date()) - filters.from
    previousNet = net(matching(all, filters, new Date(filters.from - length), filters.from))
  }

  const cashiers = new Map()
  for (const sale of all) {
    if (!cashiers.has(cashierKey(sale))) cashiers.set(cashierKey(sale), { key: cashierKey(sale), name: cashierName(sale) })
  }

  const dates = list.map((sale) => new Date(sale.created_at).getTime())
  return {
    net: net(list),
    count: list.length,
    items: items.reduce((n, item) => n + Number(item.quantity || 0), 0),
    products: new Set(items.map((item) => item.product_name)).size,
    refunded: list.reduce((sum, sale) => sum + Number(sale.refunded_amount || 0), 0),
    refundedSales: list.filter((sale) => Number(sale.refunded_amount) > 0).length,
    firstSale: dates.length ? new Date(Math.min(...dates)) : null,
    previousNet,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    top: [...products.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)).slice(0, 5),
    cashiers: [...cashiers.values()].sort((a, b) => a.name.localeCompare(b.name)),
  }
}
