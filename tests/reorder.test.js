// The reorder list's suggestions (lib/reorder.js). Run with: npm test.
import { describe, expect, it } from 'vitest'
import { MIN_AFTER_ORDER, bySupplier, orderEmailLink, orderText, soldByProduct, suggestedQty } from '../src/lib/reorder.js'

describe('how many to order', () => {
  it("orders the last 30 days' sales again", () => {
    expect(suggestedQty(5, 60)).toBe(55) // 60 sold: 55 more makes 60
  })

  it(`brings a slow product back to ${MIN_AFTER_ORDER}`, () => {
    expect(suggestedQty(5, 0)).toBe(MIN_AFTER_ORDER - 5)
    expect(suggestedQty(0, 3)).toBe(MIN_AFTER_ORDER)
  })

  it('always at least 1, and never counts stock below 0', () => {
    expect(suggestedQty(25, 0)).toBe(1)
    expect(suggestedQty(-4, 0)).toBe(MIN_AFTER_ORDER)
  })
})

describe('the list', () => {
  const sales = [
    { sale_items: [{ product_id: 1, product_name: 'Nails', quantity: 30 }, { product_id: 2, product_name: 'Tape', quantity: 2 }] },
    { sale_items: [{ product_id: 1, product_name: 'Nails', quantity: 10 }, { product_name: 'Old item', quantity: 4 }] },
  ]
  const products = [
    { id: 1, name: 'Nails', quantity: 3, supplier_id: 's2', supplier_name: 'Zeta Supply', supplier_email: 'z@example.com' },
    { id: 2, name: 'Tape', quantity: 0, supplier_id: 's1', supplier_name: 'Alpha Trading', supplier_email: '' },
    { id: 3, name: 'Old item', quantity: 1 },
    { id: 4, name: 'Glue', quantity: 2, supplier_id: 's2', supplier_name: 'Zeta Supply', supplier_email: 'z@example.com' },
  ]

  it('counts the pieces sold per product', () => {
    const sold = soldByProduct(sales)
    expect(sold.get('id:1')).toBe(40)
    expect(sold.get('name:Old item')).toBe(4)
  })

  it('groups by supplier A-Z, "No supplier yet" last, emptiest first', () => {
    const groups = bySupplier(products, soldByProduct(sales))
    expect(groups.map((g) => g.name)).toEqual(['Alpha Trading', 'Zeta Supply', 'No supplier yet'])
    expect(groups[1].items.map((i) => [i.name, i.stock, i.sold, i.qty])).toEqual([
      ['Glue', 2, 0, MIN_AFTER_ORDER - 2],
      ['Nails', 3, 40, 37],
    ])
    expect(groups[2].items[0]).toMatchObject({ name: 'Old item', sold: 4 })
  })

  it('writes the message with only the lines to order', () => {
    const group = { name: 'Zeta Supply', email: 'z@example.com', items: [{ name: 'Nails', qty: 37 }, { name: 'Glue', qty: 0 }] }
    const text = orderText(group, new Date(2026, 10, 11))
    expect(text).toContain('Order from 10 FIVE 7 Hardware (Nov 11, 2026)')
    expect(text).toContain('- Nails: 37 pcs')
    expect(text).not.toContain('Glue')
    expect(orderEmailLink(group)).toMatch(/^mailto:z%40example\.com\?subject=/)
  })
})
