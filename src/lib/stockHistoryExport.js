// Stock History → a file for the audit trail: Excel (.xlsx) or CSV.
// Every change given (the page passes the ones its search shows, all
// pages), newest first, with who and why.
//
//   downloadStockHistory({ movements, product, madeBy, format: 'xlsx' | 'csv' })

const SHOP = '10 FIVE 7 Hardware'
const BRAND = 'FFE01B32'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const pad = (n) => String(n).padStart(2, '0')

function stamp(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dayText(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function timeText(date) {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// a file name without characters Windows refuses
function fileNameFor(product, ext, made) {
  const what = product ? String(product.name || 'product').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) : 'all products'
  return `Stock history - ${what} - ${stamp(made)}.${ext}`
}

// one row of the file
function rowOf(move) {
  const at = new Date(move.created_at)
  const recorded = move.recorded_by_name && move.recorded_by_name !== move.changed_by_name ? move.recorded_by_name : ''
  return {
    date: dayText(at),
    time: timeText(at),
    product: move.product_name || '',
    change: Number(move.change ?? Number(move.new_quantity) - Number(move.old_quantity)),
    before: Number(move.old_quantity || 0),
    after: Number(move.new_quantity || 0),
    reason: move.reason || '',
    by: move.changed_by_name || '',
    recorded,
    at,
  }
}

function save(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/* ---------------- CSV ---------------- */
function csvCell(value) {
  const text = String(value ?? '')
  // a leading = + - @ would run as a formula in Excel: keep it text
  const safe = /^[=+\-@]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

function toCsv(rows) {
  const head = ['Date', 'Time', 'Product', 'Change', 'Before', 'After', 'Reason', 'By', 'Recorded as']
  const lines = [head, ...rows.map((r) => [r.date, r.time, r.product, r.change, r.before, r.after, r.reason, r.by, r.recorded])]
  // BOM: Excel opens it as UTF-8 (₱, ñ…)
  return '﻿' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n')
}

/* ---------------- Excel ---------------- */
async function toXlsx(rows, { product, madeBy, made }) {
  const module = await import('exceljs')
  const ExcelJS = module.default ?? module
  const workbook = new ExcelJS.Workbook()
  workbook.creator = SHOP
  workbook.created = made

  const sheet = workbook.addWorksheet('Stock history', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = [
    { width: 14 }, { width: 11 }, { width: 38 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 24 }, { width: 24 }, { width: 22 },
  ]

  sheet.addRow([SHOP]).font = { bold: true, size: 16 }
  sheet.addRow(['Stock history (audit trail)']).font = { bold: true, size: 12, color: { argb: 'FF6B6B76' } }
  sheet.addRow([`Product: ${product ? product.name : 'All products'}`])
  sheet.addRow([`Made on ${dayText(made)}, ${timeText(made)}${madeBy ? ` by ${madeBy}` : ''} · ${rows.length} changes`])
  sheet.addRow([])

  const head = sheet.addRow(['Date', 'Time', 'Product', 'Change', 'Before', 'After', 'Reason', 'By', 'Recorded as'])
  head.eachCell((cell, i) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
    cell.alignment = { horizontal: i >= 4 && i <= 6 ? 'right' : 'left' }
  })

  for (const r of rows) {
    const row = sheet.addRow([r.date, r.time, r.product, r.change, r.before, r.after, r.reason, r.by, r.recorded])
    const change = row.getCell(4)
    change.numFmt = '+#,##0;-#,##0;0'
    change.font = { bold: true, color: { argb: r.change > 0 ? 'FF059669' : r.change < 0 ? 'FFDC2626' : 'FF6B6B76' } }
    row.getCell(5).numFmt = '#,##0'
    row.getCell(6).numFmt = '#,##0'
    if (r.recorded) row.getCell(9).font = { italic: true, color: { argb: 'FF6B6B76' } }
  }

  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 9 } }
  return workbook.xlsx.writeBuffer()
}

export async function downloadStockHistory({ movements, product = null, madeBy = '', format = 'xlsx' }) {
  const made = new Date()
  const rows = movements.map(rowOf)
  if (format === 'csv') {
    save(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }), fileNameFor(product, 'csv', made))
    return
  }
  const buffer = await toXlsx(rows, { product, madeBy, made })
  save(new Blob([buffer], { type: XLSX_TYPE }), fileNameFor(product, 'xlsx', made))
}
