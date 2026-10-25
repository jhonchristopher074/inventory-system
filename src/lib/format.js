// Numbers the way they're read here: ₱1,234.50 and 1,000.
// toFixed(2) printed 1234.50, with no comma. Always Philippine format, so
// a browser set to another language doesn't show 1.234,50.
//
// Not for CSV files: Excel needs plain numbers (1234.50) to add them up.

const PESO = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const COUNT = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 })

// ₱1,234.50
export function peso(value) {
  return '₱' + PESO.format(Number(value) || 0)
}

// 1,000 (stock, quantities, totals of things)
export function count(value) {
  return COUNT.format(Number(value) || 0)
}
