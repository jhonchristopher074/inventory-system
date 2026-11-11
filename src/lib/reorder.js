// The reorder list (Inventory > Low stock > Reorder list): the products
// running low, by supplier, with how many to order. Only a suggestion: the
// owner copies the list or opens an email to the supplier in their own mail
// app. Nothing is ordered or sent by the system.
//
//   soldByProduct(sales)              product id (or name) -> pieces sold
//   suggestedQty(stock, sold)          pieces to order
//   bySupplier(products, sold)         [{ key, name, email, items: [...] }]
//   orderText(group, date)             the list as a message
import { LOW_STOCK } from './stock'

// Order enough for the last 30 days' sales again, and never end up with
// less than twice the low-stock mark (a product that sold nothing still
// comes back to 20).
export const MIN_AFTER_ORDER = LOW_STOCK * 2

export function suggestedQty(stock, sold) {
  const target = Math.max(Number(sold) || 0, MIN_AFTER_ORDER)
  return Math.max(target - Math.max(Number(stock) || 0, 0), 1)
}

// pieces sold per product in these sales (by id; by name for a line without one)
export function soldByProduct(sales) {
  const sold = new Map()
  for (const sale of sales || []) {
    for (const item of sale.sale_items || []) {
      const key = item.product_id != null ? `id:${item.product_id}` : `name:${item.product_name}`
      sold.set(key, (sold.get(key) || 0) + Number(item.quantity || 0))
    }
  }
  return sold
}

function soldOf(product, sold) {
  return sold.get(`id:${product.id}`) ?? sold.get(`name:${product.name}`) ?? 0
}

// One group per supplier (A-Z), "No supplier yet" last; in each, the
// emptiest products first.
export function bySupplier(products, sold = new Map()) {
  const groups = new Map()
  for (const product of products || []) {
    const key = product.supplier_id || ''
    const group = groups.get(key) || {
      key: key || 'none',
      name: key ? product.supplier_name || product.supplier_email || 'Supplier' : 'No supplier yet',
      email: key ? product.supplier_email || '' : '',
      items: [],
    }
    const piecesSold = soldOf(product, sold)
    group.items.push({
      id: product.id,
      name: product.name,
      category: product.category || '',
      stock: Number(product.quantity) || 0,
      sold: piecesSold,
      qty: suggestedQty(product.quantity, piecesSold),
      lastOrder: product.last_order || null,
    })
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
  }
  return [...groups.values()].sort((a, b) =>
    a.key === 'none' ? 1 : b.key === 'none' ? -1 : a.name.localeCompare(b.name)
  )
}

// The message for one supplier (only the lines with pieces to order)
export function orderText(group, date = new Date()) {
  const day = date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  const lines = group.items
    .filter((item) => Number(item.qty) > 0)
    .map((item) => `- ${item.name}: ${Number(item.qty)} pcs`)
  return [`Order from 10 FIVE 7 Hardware (${day})`, '', ...lines, '', 'Thank you!'].join('\n')
}

// mailto: link that opens the owner's own mail app with the order filled in
export function orderEmailLink(group, date = new Date()) {
  const subject = `Order from 10 FIVE 7 Hardware`
  return `mailto:${encodeURIComponent(group.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(orderText(group, date))}`
}
