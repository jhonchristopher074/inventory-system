// What the Sales History downloads (PDF and Excel) have in common: how
// dates read, the period they cover and their file name.

// "Oct 30, 2026"
export function reportDay(date) {
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

// "10:43 AM"
export function reportTime(date) {
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
}

/**
 * The period of the date filter.
 *
 * @param {{start: Date|null, end: Date|null}} range  the date filter (end not included)
 * @returns {{first: Date|null, last: Date|null, text: string}}
 *   first and last day (null for "all dates"), and e.g. "Oct 1, 2026 - Oct 30, 2026"
 */
export function reportPeriod(range) {
  const first = range?.start || null
  // the last day included (range.end is the midnight after it)
  const last = first ? (range.end ? new Date(range.end.getTime() - 1) : new Date()) : null

  let text = 'All dates'
  if (first) {
    text = reportDay(first) === reportDay(last) ? reportDay(first) : `${reportDay(first)} - ${reportDay(last)}`
  }

  return { first, last, text }
}

/**
 * The latest sale first, then older ones: the order of the Sales History
 * list, the PDF and the Excel file alike.
 */
export function newestFirst(sales) {
  return [...sales].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at) || Number(b.id) - Number(a.id)
  )
}

/** sales_2026-10-01_to_2026-10-30_Maria-Santos.pdf (or sales_all.xlsx) */
export function reportFileName(range, who, extension) {
  const { first, last } = reportPeriod(range)
  const ymd = (date) => date.toLocaleDateString('en-CA')

  const periodPart = first ? `${ymd(first)}_to_${ymd(last)}` : 'all'
  const whoPart = who ? '_' + who.replace(/[^A-Za-z0-9]+/g, '-') : ''

  return `sales_${periodPart}${whoPart}.${extension}`
}
