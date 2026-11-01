// What the dashboards work out from a list of sales: the Owner's from every
// sale, the Cashier's from their own. Each sale is a row of list_all_sales /
// list_my_sales_since: { created_at, total_amount, sale_items: [...] }.
// Dates are this computer's clock, like the rest of the app.
import { count, peso } from './format'

export function startOfDay(date, addDays = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays)
}

// 'YYYY-MM-DD' of a local date (the way inspection dates are written)
export function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function salesText(n) {
  return `${count(n)} sale${n === 1 ? '' : 's'}`
}

// ₱1,234.50, or ₱1.23M once it no longer fits a small tile
const MILLIONS = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 2 })

export function pesoTile(value) {
  return Math.abs(value) >= 1e6 ? '₱' + MILLIONS.format(value) : peso(value)
}

export function salesBetween(sales, from, to) {
  return sales.filter((sale) => {
    const at = new Date(sale.created_at)
    return at >= from && at < to
  })
}

// { total: pesos, count: sales, items: pieces sold }
export function summarize(list) {
  return list.reduce(
    (sum, sale) => {
      sum.total += Number(sale.total_amount || 0)
      sum.count += 1
      sum.items += (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
      return sum
    },
    { total: 0, count: 0, items: 0 }
  )
}

export function salesToday(sales, now) {
  return summarize(salesBetween(sales, startOfDay(now), startOfDay(now, 1)))
}

// from the 1st of this month up to the end of today
export function salesThisMonth(sales, now) {
  return summarize(salesBetween(sales, new Date(now.getFullYear(), now.getMonth(), 1), startOfDay(now, 1)))
}

// Today so far against yesterday up to the same time of day, so a morning
// isn't compared with a whole day. null when nothing was sold by then
// yesterday (there's nothing to compare with).
export function changeSinceYesterday(sales, now) {
  const yesterday = startOfDay(now, -1)
  const sameTimeYesterday = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate(),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  )
  const before = summarize(salesBetween(sales, yesterday, sameTimeYesterday)).total

  if (!(before > 0)) return null

  const change = Math.round(((salesToday(sales, now).total - before) / before) * 100)

  if (change === 0) return { icon: '', tone: 'text-zinc-400', text: 'Same as this time yesterday' }

  return change > 0
    ? { icon: 'up', tone: 'text-emerald-400', text: `${count(change)}% more than this time yesterday` }
    : { icon: 'down', tone: 'text-red-400', text: `${count(-change)}% less than this time yesterday` }
}

// One point per day for SalesLineChart, oldest first, today last.
export function dailyTotals(sales, now, days = 7) {
  const points = []

  for (let back = days - 1; back >= 0; back--) {
    const date = startOfDay(now, -back)
    points.push({
      key: dayKey(date),
      label: back === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      current: back === 0,
      total: 0,
      count: 0,
    })
  }

  const index = new Map(points.map((point, i) => [point.key, i]))

  for (const sale of sales) {
    const i = index.get(dayKey(new Date(sale.created_at)))
    if (i === undefined) continue
    points[i].total += Number(sale.total_amount || 0)
    points[i].count += 1
  }

  return points
}

// the day with the most money taken, or null when nothing was sold
export function bestDay(points) {
  if (points.length === 0) return null
  const best = points.reduce((a, b) => (b.total > a.total ? b : a))
  return best.total > 0 ? best : null
}

// The top products by money taken in the last `days` days, with their
// picture (from the products list) and how they compare with the first
// (share: the bar's length, at least 2% so a small seller still shows).
export function bestSellers(sales, products, now, { days = 30, limit = 5 } = {}) {
  const since = startOfDay(now, -(days - 1))
  const imageById = new Map(products.map((p) => [String(p.id), p.image_url]))
  const imageByName = new Map(products.map((p) => [p.name, p.image_url]))
  const rows = new Map()

  for (const sale of sales) {
    if (new Date(sale.created_at) < since) continue

    for (const item of sale.sale_items || []) {
      const key = item.product_id != null ? `id:${item.product_id}` : `name:${item.product_name}`
      const row = rows.get(key) || {
        key,
        name: item.product_name || 'Unknown product',
        quantity: 0,
        total: 0,
        image: imageById.get(String(item.product_id)) || imageByName.get(item.product_name) || '',
      }

      row.quantity += Number(item.quantity || 0)
      row.total += Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))
      rows.set(key, row)
    }
  }

  const list = [...rows.values()].sort((a, b) => b.total - a.total).slice(0, limit)
  const top = list[0]?.total || 0

  return list.map((row) => ({ ...row, share: top ? Math.max((row.total / top) * 100, 2) : 0 }))
}
