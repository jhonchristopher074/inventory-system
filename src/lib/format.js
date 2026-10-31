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

// ₱0 / ₱5K / ₱1.2M: amounts on a chart's scale
const COMPACT = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

export function pesoShort(value) {
  return '₱' + COMPACT.format(Number(value) || 0)
}

// When something happened, for a list: "Today, 2:35 PM", "Yesterday, 9:05 AM",
// "Oct 27, 4:10 PM" (with the year when it isn't this year).
export function dayAndTime(value, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  // round: a day around a clock change is 23 or 25 hours long
  const daysAgo = Math.round((today - day) / 86400000)

  if (daysAgo === 0) return `Today, ${time}`
  if (daysAgo === 1) return `Yesterday, ${time}`

  const dayText = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })

  return `${dayText}, ${time}`
}

// A clean top for a chart's scale (1, 2, 2.5 or 5 × 10, 100, 1000…), so the
// lines read ₱0 / ₱5K / ₱10K instead of ₱0 / ₱4,137 / ₱8,274.
export function niceTop(max) {
  if (!(max > 0)) return 1000
  const step = 10 ** Math.floor(Math.log10(max))
  const f = max / step
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * step
}
