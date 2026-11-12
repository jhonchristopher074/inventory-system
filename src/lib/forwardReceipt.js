// Sends an approved receipt to the receipt scanner (n8n): saves the owner's
// profit percentage, copies the file into the "Approved Receipt" bucket
// (that copy is what starts n8n), records it as sent, then removes the
// original. Used by Approval and by Calendar > Add receipt.
import { supabase } from './supabase'
import { APPROVED_BUCKET, RECEIPT_BUCKET, approvedCopyName, safeFileName } from './receipts'

// Copies an approved receipt into the "Approved Receipt" bucket (that copy
// is what triggers n8n), records it as sent, then removes the original.
// Before the copy, the owner's profit percentage is saved in the database;
// the database applies it to the prices of the new products.
// Throws when it couldn't be sent and recorded; the original is kept then,
// so "Send again" can still read it.
export async function forwardReceipt(upload, blob, profitPercent) {
  // Plain file name: n8n gets only the receipt, no percentage.
  const approvedPath = `${upload.id}-${safeFileName(upload.file_name)}`

  // If an earlier try already put this receipt in the bucket, don't send it
  // a second time: that would add the stock twice.
  const { data: existing } = await supabase.storage
    .from(APPROVED_BUCKET)
    .list('', { search: `${upload.id}-` })

  const alreadyThere = (existing || []).some((file) =>
    file.name.startsWith(`${upload.id}-`)
  )

  // Save the percentage first. If this fails, nothing is sent, so a receipt
  // can never reach n8n without its markup.
  if (!alreadyThere) {
    const { error: markupError } = await supabase.rpc('admin_set_receipt_markup', {
      p_upload_ref: String(upload.id),
      p_percent: profitPercent,
    })

    if (markupError) {
      throw new Error(`Could not save the profit percentage (${markupError.message})`)
    }
  }

  const { error: uploadError } = alreadyThere
    ? { error: null }
    : await supabase.storage.from(APPROVED_BUCKET).upload(approvedPath, blob, {
        contentType: blob.type || undefined,
        upsert: false,
      })

  // "Already exists" means an earlier try did copy it and only recording it
  // failed. It already reached n8n, so count it as sent instead of sending
  // it twice (which would add its stock twice).
  if (uploadError && !isAlreadyExists(uploadError)) {
    throw uploadError
  }

  const { error: markError } = await supabase.rpc('admin_mark_supplier_upload_forwarded', {
    p_upload_id: upload.id,
  })

  if (markError) {
    const notRecorded = new Error(markError.message)
    notRecorded.alreadySent = true
    throw notRecorded
  }

  const { data: removed, error: removeError } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .remove([upload.file_path])

  // .remove() can resolve with no error but an empty `removed` array —
  // that also means nothing was actually deleted (e.g. a storage RLS
  // policy silently blocked it), so both cases are checked here rather
  // than just the error.
  const deleteFailed = Boolean(removeError || !removed || removed.length === 0)

  if (deleteFailed) {
    console.error('Sent, but failed to delete the original from storage:', removeError)
  }

  return { deleteFailed, newlySent: !alreadyThere }
}

function isAlreadyExists(error) {
  return (
    String(error?.statusCode) === '409' ||
    error?.status === 409 ||
    /already exists|duplicate/i.test(error?.message || '')
  )
}

// The scanner's copy of a sent receipt (its original is removed after
// sending). The bucket is public, so this link opens it.
export function scannerCopyUrl(upload) {
  return supabase.storage.from(APPROVED_BUCKET).getPublicUrl(approvedCopyName(upload)).data.publicUrl
}

// "Send again" for a receipt the scanner didn't read: a new copy (a new file
// name, so the scanner starts again) after the profit percentage, then it's
// counted and its 10 minutes start over.
export async function rescanReceipt(upload, profitPercent) {
  const tryNo = Number(upload.scan_tries || 0) + 1

  const response = await fetch(scannerCopyUrl(upload))
  if (!response.ok) throw new Error("the scanner's copy of this receipt couldn't be found")
  const blob = await response.blob()

  // the scanner's products are matched to the newest percentage
  const { error: markupError } = await supabase.rpc('admin_set_receipt_markup', {
    p_upload_ref: String(upload.id),
    p_percent: profitPercent,
  })
  if (markupError) throw new Error(`Could not save the profit percentage (${markupError.message})`)

  const path = `${upload.id}-r${tryNo}-${safeFileName(upload.file_name)}`
  const { error: uploadError } = await supabase.storage.from(APPROVED_BUCKET).upload(path, blob, {
    contentType: blob.type || undefined,
    upsert: false,
  })
  // already there: an earlier try put it in, only counting it failed
  if (uploadError && !isAlreadyExists(uploadError)) throw uploadError

  const { error: markError } = await supabase.rpc('admin_mark_receipt_resent', {
    p_upload_id: upload.id,
    p_try: tryNo,
  })
  if (markError) console.error('Sent again, but not counted:', markError)

  return tryNo
}
