// Supplier receipts in storage, the same for the Owner's Approval page and
// the supplier's own page.
//
//   supplierReceipt   where a supplier's upload goes (notifications/<time>-<random>.jpg).
//                     The supplier who uploaded it and the owner can read it.
//   Approved Receipt  the copy made when the owner approves it. A file landing
//                     here is what starts the receipt scanner (n8n); the
//                     original in supplierReceipt is then deleted.
//                     Name: <upload id>-<file name>.
import { supabase } from './supabase'

export const RECEIPT_BUCKET = 'supplierReceipt'
export const APPROVED_BUCKET = 'Approved Receipt'

// Links made for the person logged in (they work whether or not the bucket
// is public) stay valid this long.
export const LINK_SECONDS = 6 * 60 * 60

// A file name storage accepts: letters, numbers, dot, dash, underscore.
export function safeFileName(name) {
  return String(name || 'receipt').replace(/[^A-Za-z0-9._-]+/g, '_')
}

// The approved copy's name in the Approved Receipt bucket
export function approvedCopyName(upload) {
  return `${upload.id}-${safeFileName(upload.file_name)}`
}

export function isImageFile(name) {
  return /\.(png|jpe?g|webp|gif)$/i.test(name || '')
}

/**
 * Signed links for receipts in supplierReceipt, one request for all of them.
 * Returns Map(path -> link or null). null = the file isn't in storage any
 * more (or this person may not read it). Throws only when the request itself
 * failed (e.g. no connection), so nothing is wrongly called missing then.
 */
export async function signReceiptLinks(paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  const links = new Map()
  if (unique.length === 0) return links

  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(unique, LINK_SECONDS)
  if (error) throw error

  for (const row of data || []) links.set(row.path, row.signedUrl || null)
  // a path the answer didn't mention: not readable
  for (const path of unique) if (!links.has(path)) links.set(path, null)

  return links
}

// "Object not found" from storage: the file is gone
export function isMissingFile(error) {
  const text = `${error?.message || ''} ${error?.error || ''} ${error?.statusCode || ''}`
  return /not.?found|does not exist|no such|\b404\b/i.test(text)
}
