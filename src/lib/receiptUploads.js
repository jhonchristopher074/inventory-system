// Receipts uploaded by a staff member or the owner (a supplier handed over
// the paper receipt). supabase/migrations/20261106000001_staff_owner_receipt_uploads.sql
//
//   staff   Supplier Receipts page: the receipt waits for the owner, like a
//           supplier's upload (Approval > Receipts to approve)
//   owner   Approval > Upload receipt: approved at once; the Approval page
//           sends it to the receipt scanner (with the profit percentage)
//
// The file goes into the supplierReceipt bucket and the receipt into
// supplier_uploads, like a supplier's, so everything after it is the same.
import { supabase } from './supabase'
import { RECEIPT_BUCKET } from './receipts'

export const SETUP_SQL = 'supabase/migrations/20261106000001_staff_owner_receipt_uploads.sql'
const NOT_SET_UP = `Uploading receipts isn't set up yet: run ${SETUP_SQL} in Supabase first.`

// what can be uploaded (the bucket refuses anything else too)
export const RECEIPT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}
export const RECEIPT_ACCEPT = Object.keys(RECEIPT_TYPES).join(',')
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  // "10 MB", "2.4 MB" (no ".0")
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1))} KB`
  return `${Number((bytes / (1024 * 1024)).toFixed(1))} MB`
}

// '' when the file can be uploaded, otherwise why not
export function checkReceiptFile(file) {
  if (!file) return 'Choose the receipt first.'
  if (!RECEIPT_TYPES[file.type]) return 'Use a photo (JPG or PNG) or a PDF of the receipt.'
  if (file.size === 0) return 'That file is empty. Choose another one.'
  if (file.size > RECEIPT_MAX_BYTES) {
    return `That file is ${formatFileSize(file.size)}. Use one up to ${formatFileSize(RECEIPT_MAX_BYTES)}.`
  }
  return ''
}

function isMissingSql(error) {
  return error?.code === 'PGRST202' || /could not find the function/i.test(String(error?.message || ''))
}

// SHA-256 of the file: the same receipt gives the same value whatever its
// name, so the database can refuse a receipt that's already in (its stock
// would be added twice). Browsers only offer it on https:// pages.
async function fileFingerprint(file) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Please open the site with https:// to upload receipts.')
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Uploads the receipt and records it. Returns the upload (status 'pending'
 * for staff, 'approved' for the owner). Throws an Error with a message for
 * the screen; on a refusal nothing is kept (the file is deleted again).
 */
export async function submitReceipt({ file, supplierName, note }) {
  const problem = checkReceiptFile(file)
  if (problem) throw new Error(problem)

  const fingerprint = await fileFingerprint(file)
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const path = `notifications/${unique}.${RECEIPT_TYPES[file.type]}`

  const { error: uploadError } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  })

  if (uploadError) {
    // storage still allows suppliers only: its SQL isn't run yet
    if (/row-level security|unauthori[sz]ed|\b403\b/i.test(`${uploadError.message} ${uploadError.statusCode || ''}`)) {
      throw new Error(NOT_SET_UP)
    }
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  const { data, error } = await supabase.rpc('submit_receipt_upload', {
    p_file_name: file.name,
    p_file_path: path,
    p_file_hash: fingerprint,
    p_supplier_name: supplierName,
    p_note: note || null,
  })

  if (error) {
    // refused (or not set up): nothing was saved, so the file goes too
    if (isMissingSql(error) || /^[0-9A-Z]{5}$/.test(error.code || '')) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([path]).catch(() => {})
      throw new Error(isMissingSql(error) ? NOT_SET_UP : error.message)
    }
    // no answer (e.g. the connection dropped): it may well be saved
    throw new Error("We couldn't confirm the upload (connection problem). Check My uploads before uploading it again.")
  }

  return data
}

// { ready: false } until the SQL is run
export async function listMyReceiptUploads(limit = 200) {
  const { data, error } = await supabase.rpc('list_my_receipt_uploads', { p_limit: limit })
  if (error) {
    if (isMissingSql(error)) return { ready: false, list: [] }
    throw new Error(error.message)
  }
  return { ready: true, list: data || [] }
}

// staff: take back an upload the owner hasn't looked at yet
export async function cancelReceiptUpload(upload) {
  const { error } = await supabase.rpc('cancel_my_receipt_upload', { p_upload_id: upload.id })
  if (error) throw new Error(isMissingSql(error) ? NOT_SET_UP : error.message)
  if (upload.file_path) await supabase.storage.from(RECEIPT_BUCKET).remove([upload.file_path]).catch(() => {})
}

// names to suggest in "From which supplier?" ([] when not available)
export async function listSupplierNames() {
  const { data, error } = await supabase.rpc('list_receipt_supplier_names')
  if (error) return []
  return (data || []).map((row) => row.name).filter(Boolean)
}
