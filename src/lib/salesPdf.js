/**
 * Sales History as a PDF: the shop's name, the period (and cashier) it
 * covers, the totals, then a table with one row per sale (easy to read
 * and print; the Excel file has every detail).
 *
 *   await downloadSalesPdf({ sales, range, who, cashierOf })
 *
 * The PDF library (about 400 KB) is downloaded only when a PDF is made,
 * not with the page.
 */
import { reportDay as day, reportFileName, reportPeriod, reportTime as time } from './salesReport'

const SHOP = '10 FIVE 7 Hardware'
const BRAND_RED = [224, 27, 50]

// The PDF's built-in font has no ₱ sign (it prints a wrong character), so
// amounts are plain numbers under "(PHP)" column titles.
function money(value) {
  return Number(value || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// Only characters the built-in font has: Latin-1, so names like "Niño" or
// "Café" are fine. Common ones it lacks become look-alikes, anything else "?".
function pdfText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/₱\s*/g, 'PHP ')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
    .trim()
}

/**
 * Builds the PDF (without downloading it).
 *
 * @param {object}   options
 * @param {object[]} options.sales      the sales shown, each with its sale_items
 * @param {{start: Date|null, end: Date|null}} options.range  the date filter (end not included)
 * @param {string}   [options.who]      whose sales they are (a cashier's name), if one
 * @param {Function} [options.cashierOf]  sale => cashier's name; adds a Cashier column
 * @returns {Promise<{doc: object, fileName: string}>}
 */
export async function buildSalesPdf({ sales, range, who = '', cashierOf = null }) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])

  const period = reportPeriod(range).text

  const totalAmount = sales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
  const itemsOf = (sale) => (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
  const totalItems = sales.reduce((sum, sale) => sum + itemsOf(sale), 0)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 12

  // ----- heading -----
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(20)
  doc.text(SHOP, margin, 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(90)
  doc.text('Sales History', margin, 22)

  doc.setFontSize(9)
  const details = [
    `Period: ${period}`,
    who ? `Cashier: ${pdfText(who)}` : cashierOf ? 'Cashier: All cashiers' : '',
    `Printed: ${day(new Date())}, ${time(new Date())}`,
  ].filter(Boolean)
  doc.text(details.join('     '), margin, 28)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20)
  doc.text(
    `Total sales: PHP ${money(totalAmount)}     Transactions: ${sales.length}     Items sold: ${totalItems}`,
    margin,
    34
  )

  // ----- the table: one row per sale -----
  // (number columns are right-aligned, their titles and totals too)
  const right = (content) => ({ content, styles: { halign: 'right' } })

  const head = [
    'Sale ID',
    'Date',
    'Time',
    ...(cashierOf ? ['Cashier'] : []),
    'Products',
    right('Items'),
    right('Total (PHP)'),
  ]

  const body = sales.map((sale) => {
    const when = new Date(sale.created_at)
    return [
      `#${sale.id}`,
      day(when),
      time(when),
      ...(cashierOf ? [pdfText(cashierOf(sale))] : []),
      (sale.sale_items || []).map((item) => `${pdfText(item.product_name)} x${item.quantity}`).join('\n'),
      String(itemsOf(sale)),
      money(sale.total_amount),
    ]
  })

  const foot = [
    'TOTAL',
    '',
    '',
    ...(cashierOf ? [''] : []),
    '',
    right(String(totalItems)),
    right(money(totalAmount)),
  ]

  // the two number columns are the last two
  const itemsColumn = head.length - 2
  const totalColumn = head.length - 1

  autoTable(doc, {
    startY: 39,
    head: [head],
    body,
    foot: [foot],
    showFoot: 'lastPage',
    theme: 'grid',
    margin: { left: margin, right: margin, top: 14, bottom: 16 },
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2,
      valign: 'top',
      textColor: 30,
      lineColor: [215, 215, 220],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: BRAND_RED, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [235, 235, 238], textColor: 20, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 250] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 27 },
      2: { cellWidth: 20 },
      ...(cashierOf ? { 3: { cellWidth: 40 } } : {}),
      [itemsColumn]: { cellWidth: 16, halign: 'right' },
      [totalColumn]: { cellWidth: 28, halign: 'right' },
    },
  })

  // ----- page footers: "Page 1 of 3" -----
  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120)

  for (let n = 1; n <= pages; n++) {
    doc.setPage(n)
    doc.text(`${SHOP} - Sales History`, margin, pageHeight - 8)
    doc.text(`Page ${n} of ${pages}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  return { doc, fileName: reportFileName(range, who, 'pdf') }
}

/** Builds the PDF and downloads it. */
export async function downloadSalesPdf(options) {
  const { doc, fileName } = await buildSalesPdf(options)
  doc.save(fileName)
}
