/**
 * Sales History as an Excel workbook (.xlsx), four sheets:
 *
 *   Summary     the period, the totals, and the sales per cashier and per day
 *   Sales       one row per sale
 *   Items sold  one row per product sold in each sale
 *   Products    one row per product: pieces sold, money taken, share
 *
 * Amounts, counts and dates are real numbers and dates, so Excel can add,
 * sort and filter them. Each list has its header row fixed on screen and a
 * filter on every column, and its TOTAL row adds up only the rows the filter
 * shows (SUBTOTAL), so filtering one cashier gives that cashier's total.
 * Text is never read as a formula (the CSV files could be).
 *
 *   await downloadSalesExcel({ sales, range, who, cashierOf })
 *
 * The Excel library (about 1 MB) is downloaded only when a file is made,
 * not with the page.
 */
import { reportDay, reportFileName, reportPeriod, reportTime } from './salesReport'

const SHOP = '10 FIVE 7 Hardware'

// number formats, as Excel writes them
const PESO = '"₱"#,##0.00'
const COUNT = '#,##0'
const PERCENT = '0.0%'
const DATE = 'mmm d, yyyy'
const TIME = 'h:mm AM/PM'

const BRAND = 'FFE01B32' // the header rows, in the shop's red
const LIGHT = 'FFF3F3F5' // the TOTAL rows
const LINE = 'FFD4D4DA'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Excel has no time zones: a date is the time on the wall. The library
// writes the UTC time of a date, so a sale at 10:43 AM in Manila would show
// as 2:43 AM. Hand it the wall time as if it were UTC.
function wallTime(date) {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds())
  )
}

function wallDay(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function itemsOf(sale) {
  return (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
}

function subtotalOf(item) {
  return Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))
}

// "45" stays a number (sorts as one); anything else stays text
function idOf(sale) {
  const id = Number(sale.id)
  return Number.isFinite(id) ? id : String(sale.id ?? '')
}

function columnLetter(n) {
  let letters = ''
  for (; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters
  return letters
}

function styleHeader(row, columns) {
  row.height = 22
  columns.forEach((column, i) => {
    const cell = row.getCell(i + 1)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.alignment = { vertical: 'middle', horizontal: column.numFmt ? 'right' : 'left' }
  })
}

function styleTotal(row, count) {
  for (let i = 1; i <= count; i++) {
    const cell = row.getCell(i)
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
    cell.border = { top: { style: 'thin', color: { argb: LINE } } }
  }
}

/**
 * A list on its own sheet: header (fixed on screen, a filter on every
 * column), the rows, and a TOTAL row under a blank line.
 *
 * columns: [{ header, key, width, numFmt, sum }]  sum: add it up in TOTAL
 */
function addListSheet(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1', // the header on every printed page
    },
  })

  sheet.columns = columns.map(({ header, key, width, numFmt }) => ({
    header,
    key,
    width,
    style: numFmt ? { numFmt } : {},
  }))
  styleHeader(sheet.getRow(1), columns)

  rows.forEach((row) => sheet.addRow(row))

  const firstRow = 2
  const lastRow = rows.length + 1

  // a filter on every column, over the header and the rows (not TOTAL)
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(lastRow, 1), column: columns.length } }

  if (rows.length > 0) {
    // TOTAL: of the rows the filter shows (SUBTOTAL 109 = sum of visible rows)
    const total = { [columns[0].key]: 'TOTAL' }

    columns.forEach((column, i) => {
      if (!column.sum) return
      const letter = columnLetter(i + 1)
      total[column.key] = {
        formula: `SUBTOTAL(109,${letter}${firstRow}:${letter}${lastRow})`,
        result: rows.reduce((sum, row) => sum + Number(row[column.key] || 0), 0),
      }
    })

    sheet.addRow({})
    styleTotal(sheet.addRow(total), columns.length)
  }

  return sheet
}

/**
 * Builds the workbook (without downloading it).
 *
 * @param {object}   options
 * @param {object[]} options.sales      the sales shown, each with its sale_items
 * @param {{start: Date|null, end: Date|null}} options.range  the date filter (end not included)
 * @param {string}   [options.who]      whose sales they are (a cashier's name), if one
 * @param {Function} [options.cashierOf]  sale => cashier's name; adds the cashier everywhere
 * @returns {Promise<{workbook: object, fileName: string}>}
 */
export async function buildSalesWorkbook({ sales, range, who = '', cashierOf = null }) {
  const module = await import('exceljs')
  const ExcelJS = module.default ?? module

  const made = new Date()
  const workbook = new ExcelJS.Workbook()
  workbook.creator = SHOP
  workbook.created = made

  // oldest first, like a ledger
  const list = [...sales].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const totalAmount = list.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
  const totalItems = list.reduce((sum, sale) => sum + itemsOf(sale), 0)

  /* ---------------- Summary ---------------- */
  const summary = workbook.addWorksheet('Summary', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  summary.columns = [{ width: 30 }, { width: 18 }, { width: 12 }, { width: 18 }]

  summary.addRow([SHOP]).font = { bold: true, size: 16 }
  summary.addRow(['Sales report']).font = { bold: true, size: 12, color: { argb: 'FF6B6B76' } }
  summary.addRow([])

  const info = [
    ['Period', reportPeriod(range).text],
    ['Cashier', who || (cashierOf ? 'All cashiers' : '')],
    ['Made on', `${reportDay(made)}, ${reportTime(made)}`],
  ].filter(([, value]) => value)

  for (const [label, value] of info) {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { color: { argb: 'FF6B6B76' } }
  }

  summary.addRow([])

  const figures = [
    ['Total sales', totalAmount, PESO],
    ['Transactions', list.length, COUNT],
    ['Items sold', totalItems, COUNT],
    ['Average sale', list.length ? totalAmount / list.length : 0, PESO],
  ]

  for (const [label, value, numFmt] of figures) {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { bold: true }
    row.getCell(2).font = { bold: true, size: 12 }
    row.getCell(2).numFmt = numFmt
  }

  // a small table on the Summary sheet: header, rows, total
  function summaryTable(title, headers, rows, formats) {
    summary.addRow([])
    summary.addRow([title]).font = { bold: true, size: 12 }

    const head = summary.addRow(headers)
    headers.forEach((header, i) => {
      const cell = head.getCell(i + 1)
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
      cell.alignment = { horizontal: i === 0 ? 'left' : 'right' }
    })

    for (const values of rows) {
      const row = summary.addRow(values)
      formats.forEach((numFmt, i) => {
        if (numFmt) row.getCell(i + 1).numFmt = numFmt
      })
    }

    const totals = ['TOTAL', ...headers.slice(1).map((_, i) => rows.reduce((sum, r) => sum + Number(r[i + 1] || 0), 0))]
    const totalRow = summary.addRow(totals)
    formats.forEach((numFmt, i) => {
      if (numFmt) totalRow.getCell(i + 1).numFmt = numFmt
    })
    styleTotal(totalRow, headers.length)
  }

  if (cashierOf && list.length > 0) {
    const perCashier = new Map()
    for (const sale of list) {
      const name = cashierOf(sale)
      const row = perCashier.get(name) || [name, 0, 0, 0]
      row[1] += 1
      row[2] += itemsOf(sale)
      row[3] += Number(sale.total_amount || 0)
      perCashier.set(name, row)
    }

    summaryTable(
      'Per cashier',
      ['Cashier', 'Sales', 'Items', 'Total'],
      [...perCashier.values()].sort((a, b) => b[3] - a[3]),
      [null, COUNT, COUNT, PESO]
    )
  }

  if (list.length > 0) {
    const perDay = new Map()
    for (const sale of list) {
      const when = new Date(sale.created_at)
      const key = dayKey(when)
      const row = perDay.get(key) || [wallDay(when), 0, 0, 0]
      row[1] += 1
      row[2] += itemsOf(sale)
      row[3] += Number(sale.total_amount || 0)
      perDay.set(key, row)
    }

    summaryTable('Per day', ['Day', 'Sales', 'Items', 'Total'], [...perDay.values()], [DATE, COUNT, COUNT, PESO])
  }

  /* ---------------- Sales: one row per sale ---------------- */
  addListSheet(
    workbook,
    'Sales',
    [
      { header: 'Sale ID', key: 'id', width: 10 },
      { header: 'Date', key: 'date', width: 14, numFmt: DATE },
      { header: 'Time', key: 'time', width: 11, numFmt: TIME },
      ...(cashierOf ? [{ header: 'Cashier', key: 'cashier', width: 24 }] : []),
      { header: 'Products', key: 'products', width: 60 },
      { header: 'Items', key: 'items', width: 9, numFmt: COUNT, sum: true },
      { header: 'Total', key: 'total', width: 15, numFmt: PESO, sum: true },
    ],
    list.map((sale) => {
      const when = wallTime(new Date(sale.created_at))
      return {
        id: idOf(sale),
        date: when,
        time: when,
        cashier: cashierOf ? cashierOf(sale) : undefined,
        products: (sale.sale_items || []).map((item) => `${item.product_name} x${item.quantity}`).join('; '),
        items: itemsOf(sale),
        total: Number(sale.total_amount || 0),
      }
    })
  )

  /* ---------------- Items sold: one row per product of each sale ---------------- */
  addListSheet(
    workbook,
    'Items sold',
    [
      { header: 'Sale ID', key: 'id', width: 10 },
      { header: 'Date', key: 'date', width: 14, numFmt: DATE },
      { header: 'Time', key: 'time', width: 11, numFmt: TIME },
      ...(cashierOf ? [{ header: 'Cashier', key: 'cashier', width: 24 }] : []),
      { header: 'Product', key: 'product', width: 44 },
      { header: 'Quantity', key: 'quantity', width: 11, numFmt: COUNT, sum: true },
      { header: 'Price', key: 'price', width: 14, numFmt: PESO },
      { header: 'Subtotal', key: 'subtotal', width: 15, numFmt: PESO, sum: true },
    ],
    list.flatMap((sale) => {
      const when = wallTime(new Date(sale.created_at))
      return (sale.sale_items || []).map((item) => ({
        id: idOf(sale),
        date: when,
        time: when,
        cashier: cashierOf ? cashierOf(sale) : undefined,
        product: item.product_name || 'Unknown product',
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        subtotal: subtotalOf(item),
      }))
    })
  )

  /* ---------------- Products: what sold, most money first ---------------- */
  const perProduct = new Map()
  for (const sale of list) {
    for (const item of sale.sale_items || []) {
      const name = item.product_name || 'Unknown product'
      const row = perProduct.get(name) || { product: name, quantity: 0, total: 0 }
      row.quantity += Number(item.quantity || 0)
      row.total += subtotalOf(item)
      perProduct.set(name, row)
    }
  }
  const productsTotal = [...perProduct.values()].reduce((sum, row) => sum + row.total, 0)

  addListSheet(
    workbook,
    'Products',
    [
      { header: 'Product', key: 'product', width: 44 },
      { header: 'Quantity sold', key: 'quantity', width: 14, numFmt: COUNT, sum: true },
      { header: 'Sales', key: 'total', width: 16, numFmt: PESO, sum: true },
      { header: 'Share of sales', key: 'share', width: 15, numFmt: PERCENT },
    ],
    [...perProduct.values()]
      .sort((a, b) => b.total - a.total)
      .map((row) => ({ ...row, share: productsTotal ? row.total / productsTotal : 0 }))
  )

  return { workbook, fileName: reportFileName(range, who, 'xlsx') }
}

/** Builds the workbook and downloads it. */
export async function downloadSalesExcel(options) {
  const { workbook, fileName } = await buildSalesWorkbook(options)
  const buffer = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_TYPE }))

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()

  // let the download start before the file is let go
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
