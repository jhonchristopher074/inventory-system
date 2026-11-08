// Stock History → a file for the audit trail: PDF or Excel (.xlsx).
// Every change given (the page passes the ones its search shows, all
// pages), newest first, with who and why.
//
//   downloadStockHistory({ movements, product, madeBy, format: 'pdf' | 'xlsx' })
//
// The libraries (Excel, PDF) are downloaded only when a file is made.

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

/* ---------------- PDF ---------------- */
// The PDF's built-in font has no ₱ and few symbols: Latin-1 only
function pdfText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .trim()
}

async function toPdf(rows, { product, madeBy, made }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(20)
  doc.text(SHOP, margin, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text('Stock history (audit trail)', margin, 22)

  doc.setFontSize(9)
  doc.text(
    [
      `Product: ${pdfText(product ? product.name : 'All products')}`,
      `Printed: ${dayText(made)}, ${timeText(made)}${madeBy ? ` by ${pdfText(madeBy)}` : ''}`,
      `Changes: ${rows.length}`,
    ].join('     '),
    margin,
    28
  )

  const right = (content) => ({ content, styles: { halign: 'right' } })
  autoTable(doc, {
    startY: 33,
    head: [['Date', 'Time', 'Product', right('Change'), right('Before'), right('After'), 'Reason', 'By', 'Recorded as']],
    body: rows.map((r) => [
      r.date,
      r.time,
      pdfText(r.product),
      `${r.change > 0 ? '+' : ''}${r.change}`,
      String(r.before),
      String(r.after),
      pdfText(r.reason),
      pdfText(r.by),
      pdfText(r.recorded),
    ]),
    theme: 'grid',
    margin: { left: margin, right: margin, top: 14, bottom: 16 },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: 30, lineColor: [215, 215, 220], lineWidth: 0.1 },
    headStyles: { fillColor: [224, 27, 50], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 18 },
      3: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 16, halign: 'right' },
      5: { cellWidth: 16, halign: 'right' },
    },
    // + green, - red
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 3) {
        const n = Number(data.cell.raw)
        data.cell.styles.textColor = n > 0 ? [5, 150, 105] : n < 0 ? [220, 38, 38] : [107, 107, 118]
      }
    },
  })

  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120)
  for (let n = 1; n <= pages; n++) {
    doc.setPage(n)
    doc.text(`${SHOP} - Stock history`, margin, pageHeight - 8)
    doc.text(`Page ${n} of ${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }
  return doc
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
  if (format === 'pdf') {
    const doc = await toPdf(rows, { product, madeBy, made })
    doc.save(fileNameFor(product, 'pdf', made))
    return
  }
  const buffer = await toXlsx(rows, { product, madeBy, made })
  save(new Blob([buffer], { type: XLSX_TYPE }), fileNameFor(product, 'xlsx', made))
}
