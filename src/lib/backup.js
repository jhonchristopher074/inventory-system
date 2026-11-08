// The Owner's downloads:
//   downloadBackup(madeBy)            every table, one Excel sheet each
//   downloadActivity(rows, opts)      the Activity log as shown (audit trail)
//
// Excel is downloaded only when a file is made.

import { supabase } from './supabase'
import { describeActivity, entityLabel } from './activity'
import { roleLabel } from './roles'

const SHOP = '10 FIVE 7 Hardware'
const BRAND = 'FFE01B32'
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const CELL_MAX = 32000 // Excel's limit is 32,767 characters a cell

// the sheets, in this order, with readable names
const SHEETS = {
  products: 'Products',
  categories: 'Categories',
  sales: 'Sales',
  sale_items: 'Sale items',
  refund_requests: 'Refunds',
  refund_request_items: 'Refund items',
  stock_movements: 'Stock history',
  deliveries: 'Deliveries',
  receipt_deliveries: 'Receipt deliveries',
  receipt_delivery_items: 'Receipt delivery items',
  supplier_uploads: 'Receipts',
  receipt_review_items: 'Receipt price checks',
  inspection_approvals: 'Inspections',
  documentations: 'Documentation',
  profiles: 'Accounts',
  store_settings: 'Store settings',
  activity_log: 'Activity log',
}

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const when = (d) =>
  `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`

async function newWorkbook(made) {
  const module = await import('exceljs')
  const ExcelJS = module.default ?? module
  const workbook = new ExcelJS.Workbook()
  workbook.creator = SHOP
  workbook.created = made
  return workbook
}

function styleHead(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
  })
}

function cellValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') value = JSON.stringify(value)
  if (typeof value === 'string' && value.length > CELL_MAX) return value.slice(0, CELL_MAX) + '…'
  return value
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

/* ---------------- full backup ---------------- */
export async function downloadBackup(madeBy = '') {
  const { data, error } = await supabase.rpc('admin_backup')
  if (error) {
    throw new Error(
      /admin_backup|schema cache/i.test(error.message)
        ? 'Backups need an update: run 20261116000001_activity_log_and_backup.sql first.'
        : error.message
    )
  }

  const made = new Date()
  const workbook = await newWorkbook(made)
  const tables = Object.keys(SHEETS).filter((t) => Array.isArray(data?.[t]))

  // first sheet: what's in the file
  const about = workbook.addWorksheet('About this backup')
  about.columns = [{ width: 30 }, { width: 14 }]
  about.addRow([SHOP]).font = { bold: true, size: 16 }
  about.addRow(['Full backup']).font = { bold: true, size: 12, color: { argb: 'FF6B6B76' } }
  about.addRow([`Made on ${when(made)}${madeBy ? ` by ${madeBy}` : ''}`])
  about.addRow(['Pictures and receipt photos stay in storage and are not in this file.']).font = {
    italic: true,
    color: { argb: 'FF6B6B76' },
  }
  about.addRow([])
  styleHead(about.addRow(['Sheet', 'Rows']))
  for (const t of tables) about.addRow([SHEETS[t], data[t].length])

  for (const t of tables) {
    const rows = data[t]
    const sheet = workbook.addWorksheet(SHEETS[t].slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    if (columns.length === 0) {
      sheet.addRow(['(empty)'])
      continue
    }
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.min(40, Math.max(12, key.length + 4)) }))
    styleHead(sheet.getRow(1))
    for (const row of rows) sheet.addRow(columns.map((key) => cellValue(row[key])))
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  }

  const buffer = await workbook.xlsx.writeBuffer()
  save(new Blob([buffer], { type: XLSX_TYPE }), `Backup - ${SHOP} - ${stamp(made)}.xlsx`)
  return tables.reduce((sum, t) => sum + data[t].length, 0)
}

/* ---------------- activity log ---------------- */
export async function downloadActivity(rows, { madeBy = '', period = 'All time' } = {}) {
  const made = new Date()
  const workbook = await newWorkbook(made)
  const sheet = workbook.addWorksheet('Activity log', {
    views: [{ state: 'frozen', ySplit: 6 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  sheet.columns = [{ width: 22 }, { width: 24 }, { width: 12 }, { width: 16 }, { width: 14 }, { width: 34 }, { width: 60 }]

  sheet.addRow([SHOP]).font = { bold: true, size: 16 }
  sheet.addRow(['Activity log (audit trail)']).font = { bold: true, size: 12, color: { argb: 'FF6B6B76' } }
  sheet.addRow([`Period: ${period}`])
  sheet.addRow([`Made on ${when(made)}${madeBy ? ` by ${madeBy}` : ''} · ${rows.length} entries`])
  sheet.addRow([])
  styleHead(sheet.addRow(['When', 'Who', 'Role', 'Action', 'Type', 'Item', 'Details']))

  for (const row of rows) {
    const d = describeActivity(row)
    sheet.addRow([
      when(new Date(row.created_at)),
      row.actor_name || 'System',
      roleLabel(row.actor_role) || '',
      d.verb,
      entityLabel(row.entity),
      d.item,
      d.changes.join('; '),
    ])
  }
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: 7 } }

  const buffer = await workbook.xlsx.writeBuffer()
  save(new Blob([buffer], { type: XLSX_TYPE }), `Activity log - ${period} - ${stamp(made)}.xlsx`.replace(/[\\/:*?"<>|]+/g, ' '))
}
