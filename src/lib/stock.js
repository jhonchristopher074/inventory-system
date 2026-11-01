// Stock levels, the same on every page (Inventory, Archived, the dashboards).
// A product is "low" at LOW_STOCK pieces or fewer, and "out" at 0.

export const LOW_STOCK = 10

export function stockOf(product) {
  return Number(product?.quantity || 0)
}

export function isLowStock(product) {
  return stockOf(product) <= LOW_STOCK
}

export function isOutOfStock(product) {
  return stockOf(product) <= 0
}

// emptiest first (then by name), for lists of products to restock
export function byStockLevel(a, b) {
  return stockOf(a) - stockOf(b) || String(a.name || '').localeCompare(String(b.name || ''))
}
