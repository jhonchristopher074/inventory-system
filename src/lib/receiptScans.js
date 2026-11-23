// Receipts sent to the receipt scanner (n8n) and still being read: the
// "Processing receipt…" steps. Kept here, outside the Approval page, so they
// go on when the Owner opens another page (App.vue shows a small "Processing
// receipt…" button everywhere; Approval shows the steps) and after a reload
// of the page (sessionStorage, this browser tab only).
//
// A receipt is done when its products have appeared and no more are coming
// (two checks in a row with the same count), or after 3 minutes without any.
import { ref, watch } from 'vue'
import { supabase } from './supabase'
import { toast } from './toast'
import { isWaiting } from './receiptPrices'

const KEY = 'receiptScans'
const TIMEOUT_MS = 3 * 60 * 1000
const POLL_MS = 3000

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]')
    return Array.isArray(saved) ? saved : []
  } catch {
    return []
  }
}

// { ref, name, baseline, found, stable, startedAt }
export const scans = ref(load())

watch(
  scans,
  (list) => {
    try {
      if (list.length) sessionStorage.setItem(KEY, JSON.stringify(list))
      else sessionStorage.removeItem(KEY)
    } catch {
      // storage off: the steps just don't survive a reload
    }
  },
  { deep: true }
)


// The page's own list of the scanner's products, or loads it.
// Returns the list, or null when it couldn't be read.
async function reviewItems() {
  const { data, error } = await supabase.rpc('admin_list_receipt_review')
  if (error) return null
  return data || []
}

// A receipt was just sent to the scanner: wait for its products.
// items: the scanner's products already known (its baseline).
export function startScan(upload, items = []) {
  const key = String(upload.id)
  if (scans.value.some((entry) => entry.ref === key)) return
  const baseline = items.filter((item) => item.upload_ref === key).length
  scans.value.push({ ref: key, name: upload.file_name, baseline, found: baseline, stable: 0, startedAt: Date.now() })
  ensurePolling()
}

// Updates every receipt being read from the scanner's products (items).
// Approval calls it with the list it just loaded; the timer below otherwise.
export function updateScans(items) {
  if (!items || scans.value.length === 0) return
  const finished = []

  for (const entry of scans.value) {
    const now = items.filter((item) => item.upload_ref === entry.ref).length

    if (now > entry.baseline) {
      if (now === entry.found) entry.stable += 1
      else {
        entry.found = now
        entry.stable = 0
      }

      if (entry.stable >= 1) {
        finished.push(entry)
        const found = now - entry.baseline
        const held = items.some((item) => item.upload_ref === entry.ref && isWaiting(item))
        toast(
          held
            ? `"${entry.name}": ${found} product${found === 1 ? '' : 's'} read. Open Approval > Prices to check to add them to stock.`
            : `"${entry.name}": ${found} product${found === 1 ? '' : 's'} updated. Open Approval > Prices to check.`,
          { ms: 9000 }
        )
      }
    } else if (Date.now() - entry.startedAt > TIMEOUT_MS) {
      finished.push(entry)
      toast(
        `No products from "${entry.name}" yet after 3 minutes. They'll show up in Approval by themselves when the scanner is done. If they never do, it will show under "Not read by the scanner".`,
        { kind: 'error', ms: 12000 }
      )
    }
  }

  if (finished.length) scans.value = scans.value.filter((entry) => !finished.includes(entry))
}

// checks every few seconds while something is being read, on any page
let timer = null

function ensurePolling() {
  if (timer || scans.value.length === 0) return
  timer = setInterval(async () => {
    if (scans.value.length === 0) {
      clearInterval(timer)
      timer = null
      return
    }
    const items = await reviewItems()
    // logged out, or not allowed any more: stop following
    if (items === null) {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) clearScans()
      return
    }
    updateScans(items)
  }, POLL_MS)
}

export function clearScans() {
  scans.value = []
}

// after a reload: go on following what was being read
ensurePolling()
