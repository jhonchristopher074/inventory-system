<template>
  <div>
    <PageHeader
      title="Receipts"
      subtitle="A supplier handed you the paper receipt? Upload a photo of it: the owner checks it, then its stock is added."
    />

    <p v-if="!ready" class="mb-4 rounded-xl bg-amber-500/10 p-4 text-sm text-amber-300" role="alert">
      Uploading receipts isn't set up yet. Ask the owner to run {{ SETUP_SQL }} in Supabase.
    </p>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <!-- UPLOAD -->
      <section class="card p-5" aria-labelledby="upload-title">
        <h2 id="upload-title" class="text-lg font-bold text-white">Upload a receipt</h2>

        <!-- what happens next -->
        <ol class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400" aria-label="What happens next">
          <li v-for="(step, i) in STEPS" :key="step" class="flex items-center gap-1.5">
            <span class="grid h-5 w-5 place-items-center rounded-full bg-red-600/15 text-[0.65rem] font-extrabold text-red-400">{{ i + 1 }}</span>
            {{ step }}
            <span v-if="i < STEPS.length - 1" class="text-zinc-600" aria-hidden="true">›</span>
          </li>
        </ol>

        <!-- a late receipt of an arrived delivery: pick it, and they're linked
             (as the Calendar's "Upload its receipt" does) -->
        <ReceiptUploadForm class="mt-4" mode="staff" :deliveries="waitingDeliveries" @done="onUploaded" />
      </section>

      <!-- MY UPLOADS -->
      <section ref="listTop" class="card scroll-mt-4 overflow-hidden" aria-labelledby="mine-title">
        <div class="flex flex-wrap items-center gap-2 border-b border-white/5 px-5 py-4">
          <h2 id="mine-title" class="text-lg font-bold text-white">My uploads</h2>
          <span v-if="waitingCount > 0" class="rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-bold text-yellow-400">
            {{ count(waitingCount) }} waiting
          </span>
        </div>

        <p v-if="listError" class="m-5 rounded-xl bg-red-600/15 p-3 text-sm text-red-400" role="alert">{{ listError }}</p>

        <p v-if="loading && uploads.length === 0" class="p-5 text-sm text-zinc-400">Loading…</p>
        <p v-else-if="uploads.length === 0" class="p-5 text-sm text-zinc-400">
          No uploads yet. Receipts you upload show here, with what the owner decided.
        </p>

        <ul v-else class="divide-y divide-white/5">
          <li v-for="row in visibleRows" :key="row.id" class="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <!-- picture (opens it), PDF, or nothing kept (denied) -->
            <button
              v-if="thumbOf(row)"
              type="button"
              class="shrink-0"
              :title="'View ' + row.file_name"
              @click="openViewer(row)"
            >
              <img :src="thumbOf(row)" :alt="row.file_name" class="h-11 w-11 rounded-lg object-cover" @error="thumbFailed(row)" />
            </button>
            <span v-else class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-zinc-800 text-[0.65rem] font-bold text-zinc-400">
              {{ isImageFile(row.file_name) ? '—' : 'PDF' }}
            </span>

            <div class="min-w-0 flex-1 basis-40">
              <p class="truncate text-sm font-bold text-white" :title="row.file_name">{{ row.file_name }}</p>
              <p class="truncate text-xs text-zinc-500">
                From {{ row.supplier_name || 'a supplier' }} · {{ dayAndTime(row.created_at) }}
              </p>
              <p v-if="row.note" class="truncate text-xs text-zinc-400" :title="row.note">“{{ row.note }}”</p>
            </div>

            <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="TONES[row.state.kind]">
              {{ row.state.text }}
            </span>

            <div class="flex shrink-0 gap-2">
              <button
                v-if="canView(row)"
                type="button"
                class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700"
                @click="openViewer(row)"
              >
                View
              </button>
              <!-- take it back while the owner hasn't decided (asks first) -->
              <template v-if="row.status === 'pending'">
                <button
                  v-if="takingBack !== row.id"
                  type="button"
                  class="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-600 hover:text-white"
                  :disabled="busyId === row.id"
                  @click="takingBack = row.id"
                >
                  Take back
                </button>
                <template v-else>
                  <button type="button" class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700" @click="takingBack = null">
                    Keep
                  </button>
                  <button
                    type="button"
                    class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    :disabled="busyId === row.id"
                    @click="takeBack(row)"
                  >
                    {{ busyId === row.id ? 'Removing…' : 'Yes, remove' }}
                  </button>
                </template>
              </template>
            </div>
          </li>
        </ul>

        <TablePager
          v-if="uploads.length > 0"
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="rows.length"
          noun="receipts"
        />
      </section>
    </div>

    <!-- VIEW: one receipt, big -->
    <Teleport to="body">
      <div
        v-if="viewer"
        class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/85 p-3 sm:p-6"
        role="dialog"
        aria-modal="true"
        :aria-label="viewer.row.file_name"
        @click.self="viewer = null"
        @keydown.esc="viewer = null"
      >
        <div class="flex max-h-full w-full max-w-3xl flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 truncate font-bold text-white">{{ viewer.row.file_name }}</p>
            <button type="button" class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-700" @click="viewer = null">
              Close
            </button>
          </div>
          <p v-if="viewer.state === 'loading'" class="rounded-xl bg-zinc-900 p-8 text-center text-sm text-zinc-400">Loading…</p>
          <p v-else-if="viewer.state === 'gone'" class="rounded-xl bg-zinc-900 p-8 text-center text-sm text-zinc-400">
            This receipt's file isn't kept any more.
          </p>
          <img
            v-else-if="isImageFile(viewer.row.file_name)"
            :src="viewer.url"
            :alt="viewer.row.file_name"
            class="max-h-[80vh] w-full rounded-xl object-contain"
            @error="viewer = { ...viewer, state: 'gone' }"
          />
          <iframe v-else :src="viewer.url" class="h-[80vh] w-full rounded-xl bg-white" title="Receipt"></iframe>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase, uniqueChannelName } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'
import ReceiptUploadForm from '../../components/ReceiptUploadForm.vue'
import { usePagination } from '../../lib/usePagination'
import { count, dayAndTime } from '../../lib/format'
import {
  APPROVED_BUCKET,
  LINK_SECONDS,
  RECEIPT_BUCKET,
  approvedCopyName,
  isImageFile,
  signReceiptLinks,
} from '../../lib/receipts'
import { SETUP_SQL, cancelReceiptUpload, listMyReceiptUploads } from '../../lib/receiptUploads'
import { toast } from '../../lib/toast'

const STEPS = ['You upload it', 'The owner checks it', 'The stock is added']

const uploads = ref([])
const ready = ref(true)
const loading = ref(false)
const listError = ref('')

// Calendar deliveries that arrived without their receipt (lib/deliveries.js)
const waitingDeliveries = ref([])

async function fetchWaitingDeliveries() {
  const { data, error } = await supabase.rpc('list_deliveries')
  if (error) {
    console.error(error)
    return
  }
  waitingDeliveries.value = (data || []).filter((delivery) => delivery.receipt_state === 'waiting')
}

function onUploaded() {
  fetchUploads()
  fetchWaitingDeliveries()
}

async function fetchUploads() {
  loading.value = true
  try {
    const { ready: isReady, list } = await listMyReceiptUploads()
    ready.value = isReady
    uploads.value = list
    listError.value = ''
  } catch (err) {
    listError.value = `Couldn't load your uploads: ${err.message}`
  } finally {
    loading.value = false
  }
}

/* ---- where each receipt is, and what happened to it ---- */
function stateOf(row) {
  if (row.status === 'rejected') return { kind: 'denied', text: 'Denied' }
  if (row.status === 'pending') return { kind: 'waiting', text: 'Waiting for the owner' }
  if (row.added) return { kind: 'added', text: 'Added to inventory ✓' }
  if (row.forwarded_at) return { kind: 'sent', text: 'Approved · being read' }
  return { kind: 'approved', text: 'Approved' }
}

const TONES = {
  waiting: 'bg-yellow-500/15 text-yellow-400',
  approved: 'bg-sky-500/15 text-sky-300',
  sent: 'bg-sky-500/15 text-sky-300',
  added: 'bg-emerald-600/20 text-emerald-300',
  denied: 'bg-red-600/15 text-red-400',
}

const rows = computed(() => uploads.value.map((row) => ({ ...row, state: stateOf(row) })))
const waitingCount = computed(() => uploads.value.filter((row) => row.status === 'pending').length)

const listTop = ref(null)
const { page, pageSize, visible: visibleRows } = usePagination(rows, { storageKey: 'staffReceipts', scrollTarget: listTop })

/* ---- pictures: waiting / not sent yet = the upload itself; sent = the
   approved copy; denied = not kept ---- */
function placeOf(row) {
  if (row.status === 'rejected') return null
  if (row.status === 'approved' && row.forwarded_at) return { bucket: APPROVED_BUCKET, path: approvedCopyName(row) }
  return row.file_path ? { bucket: RECEIPT_BUCKET, path: row.file_path } : null
}

function canView(row) {
  return placeOf(row) !== null
}

function placeKey(place) {
  return `${place.bucket}/${place.path}`
}

function publicLink(place) {
  return supabase.storage.from(place.bucket).getPublicUrl(place.path).data.publicUrl
}

const thumbs = ref(new Map()) // place -> link (null: none)

function thumbOf(row) {
  const place = placeOf(row)
  if (!place || !isImageFile(row.file_name)) return ''
  return thumbs.value.get(placeKey(place)) || ''
}

function thumbFailed(row) {
  const place = placeOf(row)
  if (place) thumbs.value = new Map(thumbs.value).set(placeKey(place), null)
}

async function loadThumbs(list) {
  const wanted = list.filter((row) => {
    const place = placeOf(row)
    return place && isImageFile(row.file_name) && !thumbs.value.has(placeKey(place))
  })
  if (wanted.length === 0) return

  let signed
  try {
    signed = await signReceiptLinks(wanted.filter((row) => placeOf(row).bucket === RECEIPT_BUCKET).map((row) => row.file_path))
  } catch (err) {
    console.error('Could not make the picture links:', err)
    return
  }

  const next = new Map(thumbs.value)
  for (const row of wanted) {
    const place = placeOf(row)
    next.set(placeKey(place), place.bucket === RECEIPT_BUCKET ? signed.get(place.path) || null : publicLink(place))
  }
  thumbs.value = next
}

watch(
  () => visibleRows.value.map((row) => `${row.id}:${row.status}:${row.forwarded_at || ''}`).join(','),
  () => loadThumbs(visibleRows.value),
  { immediate: true }
)

/* ---- View ---- */
const viewer = ref(null) // { row, url, state: 'loading' | 'ready' | 'gone' }

async function openViewer(row) {
  const place = placeOf(row)
  if (!place) return
  viewer.value = { row, url: '', state: 'loading' }

  let url
  if (place.bucket === RECEIPT_BUCKET) {
    const { data } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(place.path, LINK_SECONDS)
    url = data?.signedUrl || ''
  } else {
    url = publicLink(place)
    const there = await fetch(url, { method: 'HEAD' }).then((r) => r.ok).catch(() => false)
    if (!there) url = ''
  }

  if (viewer.value?.row.id !== row.id) return
  viewer.value = { row, url, state: url ? 'ready' : 'gone' }
}

/* ---- Take back (pending only) ---- */
const takingBack = ref(null)
const busyId = ref(null)

async function takeBack(row) {
  busyId.value = row.id
  listError.value = ''
  try {
    await cancelReceiptUpload(row)
    toast(`Removed "${row.file_name}". The owner won't see it.`)
    takingBack.value = null
    await fetchUploads()
  } catch (err) {
    listError.value = err.message
  } finally {
    busyId.value = null
  }
}

/* ---- the owner decides: the list follows by itself ---- */
let channel = null
let refreshTimer = null

function refreshSoon() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(fetchUploads, 400)
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshSoon()
}

onMounted(() => {
  fetchUploads()
  fetchWaitingDeliveries()
  // only this person's rows reach them (the table's read policy)
  channel = supabase
    .channel(uniqueChannelName('staff-receipts'))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_uploads' }, refreshSoon)
    .subscribe()
  document.addEventListener('visibilitychange', onVisible)
})

onUnmounted(() => {
  clearTimeout(refreshTimer)
  document.removeEventListener('visibilitychange', onVisible)
  if (channel) supabase.removeChannel(channel)
})
</script>
