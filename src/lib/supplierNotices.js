// "Your receipt was confirmed" notices for suppliers, shown in the
// notification bell (and as a short pop-up when they arrive).
//
// supplier_take_new_receipt_results (supabase/migrations/
// 20261102000002_supplier_notices.sql) gives each confirmation once and
// marks it as seen. They're kept here for this tab until logout
// (sessionStorage, nothing on the device after that): the next login only
// brings new ones.
import { ref } from 'vue'
import { supabase } from './supabase'

const KEY = 'supplierNotices'

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '[]') || []
  } catch {
    return []
  }
}

function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(supplierNotices.value))
  } catch {
    // storage blocked: they stay until the page is reloaded
  }
}

// [{ id, uploadId, fileName, products, pieces, confirmedAt, read }]
export const supplierNotices = ref(read())

// Asks for confirmations not shown yet; returns the new ones (for the
// pop-up). Until the SQL is run there are none.
export async function takeNewNotices() {
  const { data, error } = await supabase.rpc('supplier_take_new_receipt_results')
  if (error || !data?.length) return []

  const known = new Set(supplierNotices.value.map((notice) => notice.id))
  const fresh = data
    .map((row) => ({
      id: `added-${row.upload_id}`,
      uploadId: String(row.upload_id),
      fileName: row.file_name || 'Your receipt',
      products: Number(row.products) || 0,
      pieces: Number(row.pieces) || 0,
      confirmedAt: row.confirmed_at,
      read: false,
    }))
    .filter((notice) => !known.has(notice.id))

  if (fresh.length > 0) {
    supplierNotices.value = [...fresh, ...supplierNotices.value].sort(
      (a, b) => new Date(b.confirmedAt) - new Date(a.confirmedAt)
    )
    save()
  }

  return fresh
}

export function markNoticeRead(id) {
  supplierNotices.value = supplierNotices.value.map((notice) =>
    notice.id === id ? { ...notice, read: true } : notice
  )
  save()
}

export function markAllNoticesRead() {
  supplierNotices.value = supplierNotices.value.map((notice) => ({ ...notice, read: true }))
  save()
}

// logged out: they're gone
export function clearSupplierNotices() {
  supplierNotices.value = []
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // nothing to remove
  }
}

export function noticeText(notice) {
  const products = `${notice.products} ${notice.products === 1 ? 'product' : 'products'}`
  return `${products} from ${notice.fileName} ${notice.products === 1 ? 'was' : 'were'} added to the inventory (${notice.pieces} pcs).`
}
