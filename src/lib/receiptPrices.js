// Prices on the Approval page's "New prices to check": the products a
// receipt added (new) or restocked, as admin_list_receipt_review gives them:
//   { id, product_name, is_new, qty_added, cost, price, percent, ... }
//   cost     what the receipt says one piece cost (null when it doesn't say)
//   price    the product's price now (a new one: cost + percent, set by the database)
//   percent  the profit percentage the owner chose when approving (null: none)

// cost + the receipt's percentage. null when the cost is unknown; promo
// items at 0.01 or less keep their price.
export function suggestedPrice(item) {
  const cost = Number(item.cost)
  const percent = Number(item.percent)

  if (item.cost == null || item.percent == null || !(cost > 0.01) || !Number.isFinite(percent)) {
    return null
  }

  return Math.round(cost * (1 + percent / 100) * 100) / 100
}

// What a price box starts with: a new product keeps the price the database
// gave it; a restocked one gets cost + percentage when the cost is known,
// else its price now.
export function startingPrice(item) {
  const suggested = suggestedPrice(item)
  return String(item.is_new || suggested === null ? (item.price ?? '') : suggested)
}

// Profit of `price` over `cost` in %, one decimal. null without a usable cost.
export function profitPercent(cost, price) {
  const c = Number(cost)
  const p = Number(price)

  if (cost == null || !(c > 0.01) || price === '' || price == null || !Number.isFinite(p)) return null

  return Math.round(((p - c) / c) * 1000) / 10
}

// a price box holds a usable price: a number, 0 or more
export function isPrice(value) {
  return value !== '' && value != null && Number.isFinite(Number(value)) && Number(value) >= 0
}
