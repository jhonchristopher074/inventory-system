// Sales History's numbers (lib/salesQuery.js): what the page shows when the
// database works them out, and the same worked out in the browser before
// that SQL is run. Run with: npm test.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('../src/lib/supabase.js', () => ({ supabase: { rpc: (...args) => rpc(...args) } }))
vi.mock('../src/lib/guestMode.js', () => ({ guestRole: () => '' }))

// a fresh copy of the module each time (it remembers whether the database
// has the functions, and shares one load for a few seconds)
async function load() {
  vi.resetModules()
  return import('../src/lib/salesQuery.js')
}

const MISSING = { message: 'Could not find the function public.sales_page in the schema cache' }

// Nov <day>, 2026 10:00, this computer's time zone
const at = (day, hour = 10) => new Date(2026, 10, day, hour)
const SALES = [
  {
    id: 1, created_at: at(1).toISOString(), cashier_id: 'c1', profiles: { full_name: 'Ana Reyes' },
    total_amount: 300, refunded_amount: 0,
    sale_items: [
      { product_name: 'Hammer', quantity: 1, price: 250, subtotal: 250 },
      { product_name: 'Nails', quantity: 5, price: 10, subtotal: 50 },
    ],
  },
  {
    id: 2, created_at: at(5).toISOString(), cashier_id: 'c2', profiles: { full_name: 'Ben Cruz' },
    total_amount: 100, refunded_amount: 20,
    sale_items: [{ product_name: 'Nails', quantity: 10, price: 10, subtotal: 100 }],
  },
  {
    // an old sale with only the cashier's name
    id: 12, created_at: at(8).toISOString(), cashier_id: null, cashier_name: 'Old Till',
    total_amount: 500, refunded_amount: 0,
    sale_items: [{ product_name: 'Drill', quantity: 1, price: 500, subtotal: 500 }],
  },
  {
    id: 3, created_at: at(10).toISOString(), cashier_id: 'c1', profiles: { full_name: 'Ana Reyes' },
    total_amount: 50, refunded_amount: 0,
    sale_items: [{ product_name: 'Tape', quantity: 2, price: 25, subtotal: 50 }],
  },
]

// the database doesn't have the new functions yet: every sale comes from list_all_sales
function databaseWithoutFunctions() {
  rpc.mockImplementation(async (name) =>
    name === 'list_all_sales' || name === 'list_my_sales' ? { data: SALES, error: null } : { data: null, error: MISSING }
  )
}

beforeEach(() => rpc.mockReset())

describe('before the SQL is run (worked out in the browser)', () => {
  beforeEach(databaseWithoutFunctions)

  it('gives a page of sales, newest first, and how many there are', async () => {
    const { salesPage } = await load()
    const first = await salesPage({}, { limit: 2, offset: 0 })
    expect(first.total).toBe(4)
    expect(first.rows.map((s) => s.id)).toEqual([3, 12])
    const second = await salesPage({}, { limit: 2, offset: 2 })
    expect(second.rows.map((s) => s.id)).toEqual([2, 1])
  })

  it('sorts by total both ways, and gives every row with limit 0', async () => {
    const { salesPage } = await load()
    expect((await salesPage({}, { sort: 'total', dir: 'desc', limit: 0 })).rows.map((s) => s.id)).toEqual([12, 1, 2, 3])
    expect((await salesPage({}, { sort: 'total', dir: 'asc', limit: 0 })).rows.map((s) => s.id)).toEqual([3, 2, 1, 12])
  })

  it('searches sale numbers ("#1" finds 1 and 12), products and cashiers', async () => {
    const { salesPage } = await load()
    const ids = async (search) => (await salesPage({ search }, { limit: 0 })).rows.map((s) => s.id).sort((a, b) => a - b)
    expect(await ids('#1')).toEqual([1, 12])
    expect(await ids('nails')).toEqual([1, 2])
    expect(await ids('BEN')).toEqual([2])
  })

  it("filters one cashier: by id, or by name for an old sale", async () => {
    const { salesPage } = await load()
    expect((await salesPage({ cashier: 'c1' }, { limit: 0 })).rows.map((s) => s.id)).toEqual([3, 1])
    expect((await salesPage({ cashier: 'Old Till' }, { limit: 0 })).rows.map((s) => s.id)).toEqual([12])
  })

  it('adds up a period, and the same length of time before it', async () => {
    const { salesSummary } = await load()
    const summary = await salesSummary({ from: at(5, 0), to: at(11, 0) })
    expect(summary).toMatchObject({
      net: 650,
      count: 3,
      items: 13,
      products: 3,
      refunded: 20,
      refundedSales: 1,
      previousNet: 300, // Oct 30 - Nov 5: sale 1
    })
    expect(summary.top.map((t) => [t.name, t.total])).toEqual([['Drill', 500], ['Nails', 100], ['Tape', 50]])
    expect(summary.days).toEqual([
      { day: '2026-11-05', total: 100, count: 1 },
      { day: '2026-11-08', total: 500, count: 1 },
      { day: '2026-11-10', total: 50, count: 1 },
    ])
    expect(summary.firstSale).toEqual(at(5))
  })

  it('lists every cashier who ever sold, A-Z', async () => {
    const { salesSummary } = await load()
    const { cashiers } = await salesSummary({ from: at(9, 0) })
    expect(cashiers).toEqual([
      { key: 'c1', name: 'Ana Reyes' },
      { key: 'c2', name: 'Ben Cruz' },
      { key: 'Old Till', name: 'Old Till' },
    ])
  })

  it("a cashier's own page reads their own sales", async () => {
    const { salesPage } = await load()
    await salesPage({ mine: true })
    expect(rpc).toHaveBeenCalledWith('list_my_sales')
    expect(rpc).not.toHaveBeenCalledWith('list_all_sales')
  })
})

describe('after the SQL is run (worked out by the database)', () => {
  it('asks for one page, with the filters', async () => {
    rpc.mockResolvedValue({ data: { rows: [SALES[0]], total: 57 }, error: null })
    const { salesPage } = await load()
    const page = await salesPage(
      { from: at(1, 0), to: null, cashier: 'c1', search: ' hammer ' },
      { sort: 'total', dir: 'asc', limit: 10, offset: 20 }
    )
    expect(page).toEqual({ rows: [SALES[0]], total: 57 })
    expect(rpc).toHaveBeenCalledWith('sales_page', {
      p_from: at(1, 0).toISOString(),
      p_to: null,
      p_cashier: 'c1',
      p_search: 'hammer',
      p_sort: 'total',
      p_dir: 'asc',
      p_limit: 10,
      p_offset: 20,
    })
  })

  it('reads the totals as numbers (the database sends some as text)', async () => {
    rpc.mockResolvedValue({
      data: {
        net: '650.00', count: 3, items: '13', products: 3, refunded: '20', refunded_sales: 1,
        first_sale: at(5).toISOString(), previous_net: '300.00',
        days: [{ day: '2026-11-05', total: '100.00', count: 1 }],
        top: [{ name: 'Drill', quantity: '1', total: '500.00' }],
        cashiers: [{ key: 'c1', name: 'Ana Reyes' }],
      },
      error: null,
    })
    const { salesSummary } = await load()
    const summary = await salesSummary({})
    expect(summary).toMatchObject({ net: 650, items: 13, refunded: 20, refundedSales: 1, previousNet: 300 })
    expect(summary.days[0].total).toBe(100)
    expect(summary.top[0]).toEqual({ name: 'Drill', quantity: 1, total: 500 })
    expect(summary.firstSale).toEqual(at(5))
  })

  it('no period: nothing to compare with', async () => {
    rpc.mockResolvedValue({ data: { net: 0, count: 0, previous_net: null, days: [], top: [], cashiers: [] }, error: null })
    const { salesSummary } = await load()
    expect((await salesSummary({})).previousNet).toBeNull()
  })

  it('passes any other error on (it is shown on the page)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Not authorized for this action' } })
    const { salesPage } = await load()
    await expect(salesPage({})).rejects.toMatchObject({ message: 'Not authorized for this action' })
  })
})
