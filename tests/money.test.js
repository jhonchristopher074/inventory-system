// Money and stock worked out in the browser: the dashboards' numbers, the
// downloads' top sellers, receipt prices, refunds and stock levels.
// Run with: npm test (also before every deploy).
import { describe, expect, it } from 'vitest'
import { reportFileName, reportPeriod, topProducts, newestFirst } from '../src/lib/salesReport.js'
import {
  bestSellers,
  changeSinceYesterday,
  dailyTotals,
  salesThisMonth,
  salesToday,
} from '../src/lib/dashboardStats.js'
import { needsPrice, profitPercent, startingPrice, suggestedPrice } from '../src/lib/receiptPrices.js'
import { pendingBySaleItem, piecesOf } from '../src/lib/refunds.js'
import { byStockLevel, isLowStock, isOutOfStock, stockOf } from '../src/lib/stock.js'

// Nov <day>, 2026 at <hour>:<minute>, this computer's time zone
const at = (day, hour = 10, minute = 0) => new Date(2026, 10, day, hour, minute)
const sale = (id, when, total, items = []) => ({ id, created_at: when.toISOString(), total_amount: total, sale_items: items })
const item = (product_name, quantity, price, extra = {}) => ({ product_name, quantity, price, subtotal: quantity * price, ...extra })

describe('top selling products (Sales History, PDF, Excel)', () => {
  const sales = [
    sale(1, at(1), 300, [item('Hammer', 1, 250), item('Nails', 5, 10)]),
    sale(2, at(2), 100, [item('Nails', 10, 10)]),
    sale(3, at(3), 40, [{ product_name: 'Tape', quantity: 2, price: 20 }]), // no subtotal: price x pieces
  ]

  it('adds each product up and puts the most money first', () => {
    const top = topProducts(sales)
    expect(top.map((row) => [row.product, row.quantity, row.total])).toEqual([
      ['Hammer', 1, 250],
      ['Nails', 15, 150],
      ['Tape', 2, 40],
    ])
  })

  it('gives each one its share of all the money', () => {
    const top = topProducts(sales)
    expect(top[0].share).toBeCloseTo(250 / 440)
    expect(top.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(1)
  })

  it('keeps only the top ones', () => {
    expect(topProducts(sales, 2)).toHaveLength(2)
  })

  it('lists the newest sale first', () => {
    expect(newestFirst(sales).map((s) => s.id)).toEqual([3, 2, 1])
  })
})

describe('report period and file name', () => {
  it('reads "All dates" without a period', () => {
    expect(reportPeriod({ start: null, end: null }).text).toBe('All dates')
    expect(reportFileName({ start: null, end: null }, '', 'pdf')).toBe('sales_all.pdf')
  })

  it('names the first and last day (the end is not included)', () => {
    const range = { start: at(1, 0), end: at(8, 0) }
    expect(reportFileName(range, 'Maria Santos', 'xlsx')).toBe('sales_2026-11-01_to_2026-11-07_Maria-Santos.xlsx')
  })
})

describe('dashboard numbers', () => {
  const now = at(11, 15, 0) // Nov 11, 3:00 PM
  const sales = [
    sale(1, at(11, 9), 200, [item('Nails', 20, 10)]),
    sale(2, at(11, 14), 100, [item('Tape', 4, 25)]),
    sale(3, at(10, 10), 150, [item('Hammer', 1, 150)]), // yesterday morning
    sale(4, at(10, 18), 999, [item('Drill', 1, 999)]), // yesterday evening: after "this time"
    sale(5, at(1, 12), 50, [item('Nails', 5, 10)]), // earlier this month
    sale(6, new Date(2026, 9, 31, 12), 70, [item('Nails', 7, 10)]), // last month
  ]

  it("today's sales: only today", () => {
    expect(salesToday(sales, now)).toEqual({ total: 300, count: 2, items: 24 })
  })

  it('this month: from the 1st to today', () => {
    expect(salesThisMonth(sales, now)).toEqual({ total: 300 + 150 + 999 + 50, count: 5, items: 24 + 1 + 1 + 5 })
  })

  it('compares with yesterday up to the same time of day', () => {
    // 300 today vs 150 by 3 PM yesterday: +100%
    expect(changeSinceYesterday(sales, now).text).toBe('100% more than this time yesterday')
  })

  it('has nothing to compare with when yesterday had no sales by then', () => {
    expect(changeSinceYesterday(sales.filter((s) => s.id !== 3), now)).toBeNull()
  })

  it('makes 7 daily points, today last', () => {
    const points = dailyTotals(sales, now)
    expect(points).toHaveLength(7)
    expect(points[6]).toMatchObject({ label: 'Today', total: 300, count: 2, current: true })
    expect(points[5]).toMatchObject({ total: 150 + 999, count: 2 })
  })

  it('best sellers: the last 30 days, most money first, bars at least 2%', () => {
    const rows = bestSellers(sales, [], now)
    expect(rows[0]).toMatchObject({ name: 'Drill', total: 999, receipts: 1, share: 100 })
    const nails = rows.find((row) => row.name === 'Nails')
    expect(nails).toMatchObject({ quantity: 32, total: 320, receipts: 3 })
    expect(Math.min(...rows.map((row) => row.share))).toBeGreaterThanOrEqual(2)
  })
})

describe('receipt prices (Approval)', () => {
  it('suggests cost + the profit percentage, to the centavo', () => {
    expect(suggestedPrice({ cost: 100, percent: 20 })).toBe(120)
    expect(suggestedPrice({ cost: 33.33, percent: 15 })).toBe(38.33)
  })

  it('suggests nothing without a usable cost (promo items keep their price)', () => {
    expect(suggestedPrice({ cost: null, percent: 20 })).toBeNull()
    expect(suggestedPrice({ cost: 0.01, percent: 20 })).toBeNull()
    expect(suggestedPrice({ cost: 100, percent: null })).toBeNull()
  })

  it('works out the profit of a price', () => {
    expect(profitPercent(100, 125)).toBe(25)
    expect(profitPercent(80, 100)).toBe(25)
    expect(profitPercent(0, 100)).toBeNull()
  })

  it('starts a held product at the database suggestion, a restock at cost + %', () => {
    expect(startingPrice({ stock_applied: false, suggested_price: 55 })).toBe('55')
    expect(startingPrice({ is_new: false, cost: 100, percent: 10, price: 90 })).toBe('110')
    expect(startingPrice({ is_new: true, cost: 100, percent: 10, price: 95 })).toBe('95')
  })

  it("won't put a held new product on sale for ₱0", () => {
    expect(needsPrice({ stock_applied: false, is_new: true }, '0')).toBe(true)
    expect(needsPrice({ stock_applied: false, is_new: true }, '15')).toBe(false)
    expect(needsPrice({ stock_applied: true, is_new: true }, '0')).toBe(false)
  })
})

describe('refunds', () => {
  it('counts the pieces still waiting per sale line (decided ones not)', () => {
    const pending = pendingBySaleItem([
      { status: 'pending', items: [{ sale_item_id: 7, quantity: 2 }, { sale_item_id: 8, quantity: 1 }] },
      { status: 'pending', items: [{ sale_item_id: 7, quantity: 1 }] },
      { status: 'approved', items: [{ sale_item_id: 7, quantity: 5 }] },
    ])
    expect(pending.get('7')).toBe(3)
    expect(pending.get('8')).toBe(1)
  })

  it('counts the pieces of a refund', () => {
    expect(piecesOf({ items: [{ quantity: 2 }, { quantity: '3' }] })).toBe(5)
    expect(piecesOf(null)).toBe(0)
  })
})

describe('stock levels', () => {
  it('low at 10 or fewer, out at 0', () => {
    expect(isLowStock({ quantity: 10 })).toBe(true)
    expect(isLowStock({ quantity: 11 })).toBe(false)
    expect(isOutOfStock({ quantity: 0 })).toBe(true)
    expect(isOutOfStock({ quantity: 1 })).toBe(false)
    expect(stockOf({})).toBe(0)
  })

  it('sorts the emptiest first, then by name', () => {
    const list = [{ name: 'B', quantity: 3 }, { name: 'A', quantity: 3 }, { name: 'C', quantity: 0 }]
    expect(list.sort(byStockLevel).map((p) => p.name)).toEqual(['C', 'A', 'B'])
  })
})
