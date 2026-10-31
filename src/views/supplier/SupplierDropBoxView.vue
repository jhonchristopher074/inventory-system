<template>
  <div>
    <PageHeader title="Dashboard" subtitle="Upload your receipts and follow what happens to them." />

    <!-- NEWS, on both tabs: the owner's decision (until closed), and approved
         receipts counting down to the receipt scanner -->
    <div
      v-if="decisionAlert"
      class="mb-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm"
      :class="decisionAlert.status === 'approved'
        ? 'border-emerald-500/40 bg-emerald-600/10 text-emerald-400'
        : 'border-red-500/40 bg-red-600/10 text-red-400'"
      role="status"
    >
      <span class="min-w-0">
        <b class="break-all text-white">{{ decisionAlert.fileName }}</b>
        was {{ decisionAlert.status === 'approved' ? 'approved' : 'denied' }} by the owner.
      </span>
      <button
        type="button"
        class="shrink-0 rounded-lg px-2 py-1 font-bold opacity-70 hover:opacity-100"
        aria-label="Close"
        @click="dismissDecisionAlert"
      >
        ✕
      </button>
    </div>

    <div
      v-for="row in activeTimers"
      :key="'timer-' + row.id"
      class="mb-4 flex items-center justify-between gap-4 rounded-2xl border border-sky-400/40 bg-sky-400/[0.08] px-4 py-3"
    >
      <div class="min-w-0">
        <p class="truncate text-sm font-bold text-white">{{ row.file_name }}</p>
        <p class="text-xs text-sky-300">
          {{
            row.state.kind === 'countdown'
              ? 'Approved · goes to the receipt scanner in'
              : 'Approved · sending to the receipt scanner now…'
          }}
        </p>
      </div>

      <div
        v-if="row.state.kind === 'countdown'"
        class="shrink-0 text-3xl font-extrabold tabular-nums text-sky-400"
        role="timer"
        :aria-label="'Time left: ' + clock(row.state.left)"
      >
        {{ clock(row.state.left) }}
      </div>
      <div
        v-else
        class="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-white/15 border-t-sky-400"
        aria-hidden="true"
      ></div>
    </div>

    <!-- TABS, like the other pages. The open one is in the address
         (?tab=uploads), so a refresh keeps it. -->
    <div class="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 sm:gap-3">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition sm:px-5 sm:py-3 sm:text-base"
        :class="activeTab === tab.key
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'"
        :aria-pressed="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        <NavIcon :name="tab.icon" class="h-4 w-4" />
        {{ tab.label }}
        <span
          v-if="tab.count > 0"
          class="grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-extrabold"
          :class="activeTab === tab.key ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
        >
          {{ count(tab.count) }}
        </span>
      </button>
    </div>

    <!-- ============================================================
         UPLOAD: drop a receipt, or click (Enter / Space) to choose one
    ============================================================ -->
    <section v-if="activeTab === 'upload'" class="mx-auto max-w-2xl" aria-label="Upload a receipt">
      <div class="card p-4 sm:p-6">
        <div
          class="drop-zone"
          :class="{ 'is-dragging': isDragging, 'has-file': selectedFile, 'is-busy': uploading }"
          role="button"
          tabindex="0"
          :aria-disabled="uploading"
          aria-label="Choose a receipt to upload"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          @click="browse"
          @keydown.self.enter.prevent="browse"
          @keydown.self.space.prevent="browse"
        >
          <input ref="fileInput" type="file" hidden accept=".png,.jpg,.jpeg,.pdf" @change="handleFileSelect" />

          <!-- nothing chosen yet -->
          <div v-if="!selectedFile" class="text-center">
            <span class="drop-icon"><NavIcon name="upload" class="h-7 w-7" /></span>
            <p class="mt-4 text-lg font-extrabold text-white">Drop your receipt here</p>
            <p class="mt-1 text-sm text-zinc-400">or click to choose a file</p>
            <p class="mt-3 text-xs text-zinc-500">PNG, JPG or PDF, up to 10 MB</p>
          </div>

          <!-- a file is chosen: send it, or take it off -->
          <div v-else class="w-full text-center">
            <span class="drop-icon is-ready"><NavIcon name="check" class="h-7 w-7" /></span>
            <p class="mx-auto mt-4 max-w-md truncate text-lg font-extrabold text-white" :title="selectedFile.name">
              {{ selectedFile.name }}
            </p>
            <p class="mt-1 text-sm text-zinc-400">{{ formatFileSize(selectedFile.size) }}</p>

            <div class="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                class="rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-700 disabled:opacity-50"
                :disabled="uploading"
                @click.stop="removeFile"
              >
                Remove
              </button>
              <button
                type="button"
                class="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                :disabled="uploading"
                @click.stop="submit"
              >
                {{ uploading ? 'Uploading…' : 'Upload receipt' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="errorMessage" class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
          {{ errorMessage }}
        </p>

        <div
          v-if="successMessage"
          class="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-600/15 p-3 text-sm text-emerald-400"
          role="status"
        >
          <span>{{ successMessage }}</span>
          <button type="button" class="font-bold text-white hover:underline" @click="activeTab = 'uploads'">
            See it in My uploads ›
          </button>
        </div>
      </div>

      <!-- what happens to a receipt after it's uploaded -->
      <ol class="mt-4 grid gap-3 sm:grid-cols-3" aria-label="What happens next">
        <li v-for="(step, i) in STEPS" :key="step.title" class="card flex gap-3 p-4">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-600/15 text-xs font-extrabold text-red-400">
            {{ i + 1 }}
          </span>
          <div class="min-w-0">
            <p class="text-sm font-bold text-white">{{ step.title }}</p>
            <p class="mt-0.5 text-xs text-zinc-400">{{ step.text }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- ============================================================
         MY UPLOADS: a data table, newest first, 10 / 15 / all a page
    ============================================================ -->
    <section v-else aria-label="My uploads">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Show uploads">
          <button
            v-for="option in STATUS_FILTERS"
            :key="option.key"
            type="button"
            class="flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold"
            :class="statusFilter === option.key
              ? 'border-red-500/60 bg-red-600/15 text-white'
              : 'border-white/10 bg-zinc-900 text-zinc-400 hover:text-white'"
            :aria-pressed="statusFilter === option.key"
            @click="statusFilter = option.key"
          >
            {{ option.label }}
            <span class="text-xs" :class="statusFilter === option.key ? 'text-red-300' : 'text-zinc-500'">
              {{ count(statusCounts[option.key]) }}
            </span>
          </button>
        </div>

        <input
          v-model="search"
          type="search"
          placeholder="Search file name..."
          aria-label="Search file name"
          class="w-full rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500 sm:w-64"
        />
      </div>

      <div ref="tableTop" class="card scroll-mt-4 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="data-table resp-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Uploaded</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="row in visibleRows" :key="row.id">
                <td class="cell-main">
                  <div class="flex min-w-0 items-center gap-3">
                    <span class="file-badge" aria-hidden="true">{{ fileKind(row.file_name) }}</span>
                    <p class="min-w-0 max-w-xs truncate font-bold text-white sm:max-w-md" :title="row.file_name">
                      {{ row.file_name }}
                    </p>
                  </div>
                </td>

                <td data-label="Uploaded" class="whitespace-nowrap text-sm text-zinc-400">
                  {{ dayAndTime(row.created_at) }}
                </td>

                <td data-label="Status">
                  <span class="chip" :class="CHIP_TONES[row.state.kind]">
                    {{ row.state.kind === 'countdown' ? 'Sends in ' + clock(row.state.left) : row.state.text }}
                  </span>
                </td>
              </tr>

              <tr v-if="shownRows.length === 0">
                <td colspan="3" class="cell-main p-6 text-center text-zinc-500">{{ emptyText }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePager
          v-if="shownRows.length > 0"
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="shownRows.length"
          noun="uploads"
        />
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { supabase, uniqueChannelName } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import NavIcon from '../../components/NavIcon.vue'
import TablePager from '../../components/TablePager.vue'
import { usePagination } from '../../lib/usePagination'
import { useQueryParam } from '../../lib/useQueryParam'
import { count, dayAndTime } from '../../lib/format'

/* ------------------------------------------------------------------
  Config
  The original code used two different, inconsistently-spelled bucket
  names ('supplierReceipt' on upload, 'supplierReceipts' on delete).
  This is the one real bucket — matches what's actually in Supabase
  Storage. Needs insert/select/delete policies on storage.objects for
  it (see supplier_receipts_storage_policy.sql).
------------------------------------------------------------------ */
const BUCKET = 'supplierReceipt'
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

// My uploads holds up to this many (the newest). The database gives at
// most 50 until supabase/migrations/20261031000001_supplier_uploads_history.sql
// is run, which raises it to 500.
const HISTORY_LIMIT = 500

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}

const STEPS = [
  { title: 'You upload it', text: 'A photo or PDF of the receipt.' },
  { title: 'The owner checks it', text: 'Approved or denied: you see it here.' },
  { title: 'The stock is added', text: 'Approved receipts go to the receipt scanner.' },
]

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// the small label in front of a file's name
function fileKind(name) {
  const extension = String(name || '').split('.').pop().toLowerCase()
  if (extension === 'pdf') return 'PDF'
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'IMG'
  return 'FILE'
}

/* ------------------------------------------------------------------
  Upload + validate (the file-picking half of what uploadImage.js
  does for images elsewhere — kept local here since this screen also
  needs PDFs and needs the storage path back, not just the URL)
------------------------------------------------------------------ */
async function uploadToStorage(file) {
  const extension = ALLOWED_TYPES[file.type]

  if (!extension) {
    throw new Error('That file type isn\'t supported. Please use PNG, JPG or PDF.')
  }

  if (file.size > MAX_BYTES) {
    throw new Error(`That file is too large. Please use one under ${formatFileSize(MAX_BYTES)}.`)
  }

  if (file.size === 0) {
    throw new Error('That file is empty. Please choose another one.')
  }

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const path = `notifications/${unique}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return { path, publicUrl }
}

/* ------------------------------------------------------------------
  Submit — used by this screen
------------------------------------------------------------------ */
// SHA-256 of the file's contents: the same file always gives the same
// value, whatever it's called. The database refuses a receipt whose
// fingerprint is already pending or approved, so the same receipt can't
// reach the receipt scanner twice (which would add its stock twice).
async function fileFingerprint(file) {
  // Browsers only offer this on secure (https://) pages. Without it the
  // duplicate check can't run, so the upload is refused instead of
  // letting the same receipt in twice (the server also requires it).
  if (!globalThis.crypto?.subtle) {
    throw new Error('Please open the site with https:// to upload receipts.')
  }

  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function submitSupplierUpload(file) {
  const fingerprint = await fileFingerprint(file)
  const { path, publicUrl } = await uploadToStorage(file)

  const { data, error } = await supabase.rpc('supplier_submit_upload', {
    p_file_name: file.name,
    p_file_path: path,
    p_file_url: publicUrl,
    p_file_hash: fingerprint,
  })

  if (error) {
    // A refusal from the database (e.g. "already uploaded") comes with a
    // 5-character error code: nothing was saved, so the file goes too.
    if (/^[0-9A-Z]{5}$/.test(error.code || '')) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
      throw new Error(error.message)
    }

    // No code: the request may not have finished (e.g. the connection
    // dropped on the way back), so the upload may well be saved. Its file
    // is kept. Deleting it used to leave a saved upload with no file,
    // which couldn't be approved or uploaded again.
    throw new Error(
      "We couldn't confirm the upload (connection problem). Check My uploads before uploading it again."
    )
  }

  return data
}

/* ------------------------------------------------------------------
  Component state
------------------------------------------------------------------ */
const fileInput = ref(null)
const selectedFile = ref(null)
const isDragging = ref(false)
const uploading = ref(false)

const errorMessage = ref('')
const successMessage = ref('')

// Set once admin approves/rejects — shown as its own banner so it
// doesn't get overwritten the next time this supplier uploads something.
const decisionAlert = ref(null) // { status: 'approved' | 'rejected', fileName }

function pickFile(file) {
  // not during an upload: the file on screen must be the one being sent
  // (a file dropped mid-upload used to replace it, then vanish unsent)
  if (!file || uploading.value) return

  errorMessage.value = ''
  successMessage.value = ''
  selectedFile.value = file
}

// the drop zone was clicked (or Enter / Space on it): the file chooser
function browse() {
  if (!uploading.value) fileInput.value?.click()
}

function handleFileSelect(event) {
  pickFile(event.target.files[0])
}

function handleDrop(event) {
  isDragging.value = false
  pickFile(event.dataTransfer.files[0])
}

function removeFile() {
  selectedFile.value = null
  errorMessage.value = ''
  successMessage.value = ''

  // clears the <input> so picking the same file again still fires @change
  if (fileInput.value) fileInput.value.value = ''
}

async function submit() {
  if (!selectedFile.value || uploading.value) return

  uploading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  decisionAlert.value = null

  const file = selectedFile.value

  try {
    await submitSupplierUpload(file)

    successMessage.value = 'Uploaded. The owner has been notified.'
    if (selectedFile.value === file) {
      selectedFile.value = null
      if (fileInput.value) fileInput.value.value = ''
    }
  } catch (err) {
    errorMessage.value = err.message || 'Upload failed. Please try again.'
  } finally {
    // also after a failure: it may have been saved after all
    fetchMyUploads()
    uploading.value = false
  }
}

/* ------------------------------------------------------------------
  My uploads + send timer
  After the admin approves a receipt it waits for its turn and is sent
  to the receipt scanner (about 90 seconds apart). The database says how
  many seconds are left (supplier_list_my_uploads), so the countdown is
  right even when this device's clock isn't.
------------------------------------------------------------------ */
const activeTab = useQueryParam('tab', 'upload', ['upload', 'uploads'])
const myUploads = ref([])
const fetchedAt = ref(0) // when myUploads was loaded (this device's time)
const nowMs = ref(Date.now()) // ticks every second while the page is open

// after the send time: "Sending…" for this long, then just "Approved"
// (e.g. the admin closed the Approval page before it was sent)
const SENDING_GRACE_S = 180

// upload id -> last status seen, so the approved / denied banner shows once
const knownStatus = new Map()

// Several refreshes can overlap (realtime, the 20 s check, after an
// upload). Only the newest answer is used: an older one arriving last
// used to bring back an earlier list, and a banner already closed.
let fetchSeq = 0

async function fetchMyUploads() {
  const seq = ++fetchSeq
  const { data, error } = await supabase.rpc('supplier_list_my_uploads', { p_limit: HISTORY_LIMIT })

  if (seq !== fetchSeq) return

  if (error) {
    // e.g. the 2026-10-19 supplier_send_timer SQL wasn't run yet: no list
    console.error(error)
    return
  }

  fetchedAt.value = Date.now()
  nowMs.value = fetchedAt.value
  myUploads.value = data || []

  for (const row of myUploads.value) {
    if (knownStatus.get(row.id) === 'pending') noteStatus(row.id, row.status, row.file_name)
    else knownStatus.set(row.id, row.status)
  }
}

function stateOf(row) {
  if (row.status === 'rejected') return { kind: 'rejected', text: 'Denied' }
  if (row.status !== 'approved') return { kind: 'pending', text: 'Waiting for approval' }
  if (row.forwarded_at) return { kind: 'sent', text: 'Sent to the scanner ✓' }

  if (row.seconds_to_send != null) {
    const left = row.seconds_to_send - Math.floor((nowMs.value - fetchedAt.value) / 1000)

    if (left > 0) return { kind: 'countdown', text: '', left }
    if (left > -SENDING_GRACE_S) return { kind: 'sending', text: 'Sending…' }
  }

  return { kind: 'approved', text: 'Approved · waiting to be sent' }
}

// the status chip's colours
const CHIP_TONES = {
  pending: 'bg-yellow-500/15 text-yellow-400',
  countdown: 'bg-sky-500/15 text-sky-300',
  sending: 'bg-sky-500/15 text-sky-300',
  sent: 'bg-emerald-600/15 text-emerald-400',
  approved: 'bg-white/5 text-zinc-300',
  rejected: 'bg-red-600/15 text-red-400',
}

const uploadRows = computed(() =>
  myUploads.value.map((row) => ({ ...row, state: stateOf(row) }))
)

// ----- My uploads table: status filter, search, 10 / 15 / all a page -----
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'sent', label: 'Sent' },
  { key: 'denied', label: 'Denied' },
]
const statusFilter = ref('all')
const search = ref('')

// which filter a row belongs to ("waiting" = for approval or to be sent)
function groupOf(row) {
  if (row.state.kind === 'rejected') return 'denied'
  if (row.state.kind === 'sent') return 'sent'
  return 'waiting'
}

const statusCounts = computed(() => {
  const counts = { all: uploadRows.value.length, waiting: 0, sent: 0, denied: 0 }
  for (const row of uploadRows.value) counts[groupOf(row)] += 1
  return counts
})

const shownRows = computed(() => {
  const text = search.value.trim().toLowerCase()

  return uploadRows.value.filter(
    (row) =>
      (statusFilter.value === 'all' || groupOf(row) === statusFilter.value) &&
      (!text || String(row.file_name || '').toLowerCase().includes(text))
  )
})

const emptyText = computed(() => {
  if (uploadRows.value.length === 0) return 'No uploads yet. Your receipts show here after you upload them.'
  if (search.value.trim()) return `No upload matches "${search.value.trim()}".`
  return 'No uploads here.'
})

const tableTop = ref(null)

const {
  page,
  pageSize,
  visible: visibleRows,
  reset: resetPage,
} = usePagination(shownRows, { storageKey: 'myUploads', scrollTarget: tableTop })

// another filter or search starts again at page 1
watch([statusFilter, search], resetPage)

// waiting for approval or not sent yet: the number on the My uploads tab
const openCount = computed(() => myUploads.value.filter(isOpen).length)

const tabs = computed(() => [
  { key: 'upload', label: 'Upload', icon: 'upload', count: 0 },
  { key: 'uploads', label: 'My uploads', icon: 'docs', count: openCount.value },
])

const activeTimers = computed(() =>
  uploadRows.value.filter((row) => row.state.kind === 'countdown' || row.state.kind === 'sending')
)

// 75 -> "1:15"
function clock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// waiting for approval, or approved but not sent yet
function isOpen(row) {
  return row.status === 'pending' || (row.status === 'approved' && !row.forwarded_at)
}

// several updates arrive together (approved, then its send time): one refresh
let refreshTimer = null

function scheduleMyUploadsRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(fetchMyUploads, 300)
}

/* ------------------------------------------------------------------
  Live alert when admin approves/rejects one of this supplier's
  uploads. Needs two things or nothing arrives here:
    1. supplier_uploads added to realtime — supplier_uploads_realtime.sql
    2. RLS enabled on supplier_uploads with a policy that lets this
        supplier see the row — supplier_uploads_rls.sql
  Subscribing with a server-side `filter:` (supplier_id=eq...) was tried
  first, but NotificationBell.vue already found that unreliable on this
  project and filters client-side instead — matching that proven
  approach here: subscribe to every update, then only act on rows that
  belong to this supplier.
------------------------------------------------------------------ */
let uploadsChannel = null
let myId = null

async function setupDecisionAlerts() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return
  myId = user.id

  uploadsChannel = supabase
    .channel(uniqueChannelName('supplier-uploads-mine'))
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'supplier_uploads' },
      (payload) => {
        const { id, supplier_id, status, file_name } = payload.new

        if (supplier_id !== myId) return

        noteStatus(id, status, file_name)
        scheduleMyUploadsRefresh() // e.g. its send time was just set
      }
    )
    .subscribe()
}

// Shows the banner when a status changes, not again for later updates of
// the same upload (its send time, "sent" being saved...).
function noteStatus(id, status, fileName) {
  const before = knownStatus.get(id)
  knownStatus.set(id, status)

  if (before === status) return
  if (status !== 'approved' && status !== 'rejected') return

  decisionAlert.value = { status, fileName }
}

function dismissDecisionAlert() {
  decisionAlert.value = null
}

let tickTimer = null
let pollTimer = null

onMounted(() => {
  fetchMyUploads()
  setupDecisionAlerts()

  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 1000)

  // safety net in case a live update is missed, only while something is open
  pollTimer = setInterval(() => {
    if (myUploads.value.some(isOpen)) fetchMyUploads()
  }, 20000)
})

onUnmounted(() => {
  clearInterval(tickTimer)
  clearInterval(pollTimer)
  clearTimeout(refreshTimer)
  if (uploadsChannel) supabase.removeChannel(uploadsChannel)
})
</script>

<style scoped>
/* the drop zone: dashed until a file is chosen, red while one is dragged over it */
.drop-zone {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  border: 2px dashed rgba(255, 255, 255, 0.14);
  background: var(--surface-sunken);
  padding: 2rem 1.25rem;
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    background-color 0.2s var(--ease),
    box-shadow 0.2s var(--ease),
    transform 0.2s var(--ease);
}

.drop-zone:hover,
.drop-zone:focus-visible {
  outline: none;
  border-color: rgba(224, 27, 50, 0.55);
  background: rgba(224, 27, 50, 0.04);
  box-shadow: 0 0 30px rgba(224, 27, 50, 0.12);
}

.drop-zone.is-dragging {
  border-color: var(--brand-bright);
  background: rgba(224, 27, 50, 0.08);
  box-shadow: 0 0 40px rgba(224, 27, 50, 0.3);
  transform: scale(1.01);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: rgba(224, 27, 50, 0.55);
}

.drop-zone.is-busy {
  cursor: progress;
}

@media (max-width: 760px) {
  .drop-zone {
    min-height: 220px;
    padding: 1.5rem 1rem;
  }
}

.drop-icon {
  display: grid;
  width: 4rem;
  height: 4rem;
  margin: 0 auto;
  place-items: center;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  box-shadow: var(--shadow-glow);
}

.drop-icon.is-ready {
  background: var(--color-emerald-600);
  box-shadow: 0 6px 20px -6px rgba(16, 185, 129, 0.5);
}

/* "PDF" / "IMG" in front of a file's name */
.file-badge {
  display: grid;
  flex: none;
  width: 2.6rem;
  height: 2.6rem;
  place-items: center;
  border-radius: 10px;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--color-zinc-400);
}

/* status labels: always a word (the countdown in steady-width digits) */
.chip {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border-radius: 999px;
  padding: 0.2rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
