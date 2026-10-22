  <template>
    <div class="upload-container">
      <div class="drop-box-wrap">
        <!-- TABS: upload a receipt / see where your uploads are -->
        <div class="tabs" role="tablist">
          <button
            class="tab"
            :class="{ active: activeTab === 'upload' }"
            role="tab"
            :aria-selected="activeTab === 'upload'"
            @click="activeTab = 'upload'"
          >
            Upload
          </button>
          <button
            class="tab"
            :class="{ active: activeTab === 'uploads' }"
            role="tab"
            :aria-selected="activeTab === 'uploads'"
            @click="activeTab = 'uploads'"
          >
            My uploads
            <span v-if="openCount > 0" class="tab-count">{{ openCount }}</span>
          </button>
        </div>

        <!-- the approved / denied news and the send timer show on both tabs -->
        <div
          v-if="decisionAlert"
          class="decision-banner"
          :class="decisionAlert.status"
        >
          <span>
            <strong>{{ decisionAlert.fileName }}</strong>
            was {{ decisionAlert.status === 'approved' ? 'approved' : 'denied' }} by the admin.
          </span>
          <button class="decision-dismiss" @click="dismissDecisionAlert">✕</button>
        </div>

        <!-- SEND TIMER: an approved receipt waiting for its turn at the scanner -->
        <div v-for="row in activeTimers" :key="'timer-' + row.id" class="send-timer">
          <div class="send-timer-body">
            <p class="send-timer-name">{{ row.file_name }}</p>
            <p class="send-timer-text">
              {{
                row.state.kind === 'countdown'
                  ? 'Approved · goes to the receipt scanner in'
                  : 'Approved · sending to the receipt scanner now…'
              }}
            </p>
          </div>

          <div
            v-if="row.state.kind === 'countdown'"
            class="send-timer-clock"
            role="timer"
            :aria-label="'Time left: ' + clock(row.state.left)"
          >
            {{ clock(row.state.left) }}
          </div>
          <div v-else class="send-timer-spinner" aria-hidden="true"></div>
        </div>

        <div
          v-if="activeTab === 'upload'"
          class="drop-box"
          :class="{ dragging: isDragging, hasFile: selectedFile }"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="handleDrop"
          @click="!uploading && fileInput.click()"
        >
          <input ref="fileInput" type="file" hidden accept=".png,.jpg,.jpeg,.pdf" @change="handleFileSelect" />

          <!-- EMPTY STATE -->
          <div v-if="!selectedFile" class="upload-content">
            <div class="upload-icon">↑</div>
            <h2>Drop your file here</h2>
            <p>Drag & drop your file here, or click to browse</p>
            <small>PNG, JPG, PDF up to 10MB</small>
          </div>

          <!-- FILE SELECTED -->
          <div v-else class="file-content">
            <div class="file-icon">✓</div>
            <h2>{{ selectedFile.name }}</h2>
            <p>{{ formatFileSize(selectedFile.size) }}</p>

            <div class="file-actions">
              <button class="remove-button" :disabled="uploading" @click.stop="removeFile">
                Remove File
              </button>
              <button class="upload-button" :disabled="uploading" @click.stop="submit">
                {{ uploading ? 'Uploading...' : 'Upload File' }}
              </button>
            </div>
          </div>
        </div>

        <p v-if="activeTab === 'upload' && errorMessage" class="status-msg error">{{ errorMessage }}</p>
        <p v-if="activeTab === 'upload' && successMessage" class="status-msg success">{{ successMessage }}</p>

        <!-- MY UPLOADS: last 50, by day, filter by status, 15 at a time -->
        <section v-if="activeTab === 'uploads'" class="my-uploads" aria-labelledby="my-uploads-title">
          <h3 id="my-uploads-title" class="sr-only">Your uploads</h3>

          <div class="filters" role="tablist" aria-label="Show uploads">
            <button
              v-for="option in STATUS_FILTERS"
              :key="option.key"
              class="filter"
              :class="{ active: statusFilter === option.key }"
              :aria-pressed="statusFilter === option.key"
              @click="statusFilter = option.key"
            >
              {{ option.label }}
              <span class="filter-count">{{ statusCounts[option.key] }}</span>
            </button>
          </div>

          <p v-if="filteredRows.length === 0" class="my-uploads-empty">
            {{ uploadRows.length === 0 ? 'No uploads yet.' : 'Nothing here.' }}
          </p>

          <div v-for="day in visibleDays" :key="day.key" class="day">
            <p class="day-title">{{ day.title }}</p>

            <ul>
              <li v-for="row in day.rows" :key="row.id" class="my-upload">
                <p class="my-upload-name">{{ row.file_name }}</p>
                <span class="my-upload-time">{{ formatTime(row.created_at) }}</span>
                <span class="chip" :class="row.state.kind">
                  {{ row.state.kind === 'countdown' ? 'Sends in ' + clock(row.state.left) : row.state.text }}
                </span>
              </li>
            </ul>
          </div>

          <button v-if="remainingRows > 0" class="show-more" @click="shownCount += PAGE">
            Show more ({{ remainingRows }} left)
          </button>
        </section>
      </div>
    </div>
  </template>

  <script setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { supabase, uniqueChannelName } from '../../lib/supabase'

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

  const ALLOWED_TYPES = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

      successMessage.value = 'Uploaded. The admin has been notified.'
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
    My recent uploads + send timer
    After the admin approves a receipt it waits for its turn and is sent
    to the receipt scanner (about 90 seconds apart). The database says how
    many seconds are left (supplier_list_my_uploads), so the countdown is
    right even when this device's clock isn't.
  ------------------------------------------------------------------ */
  const activeTab = ref('upload') // 'upload' | 'uploads'
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
    const { data, error } = await supabase.rpc('supplier_list_my_uploads', { p_limit: 50 })

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

  // ----- My uploads tab: status filter, grouped by day, 15 at a time -----
  const STATUS_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'waiting', label: 'Waiting' },
    { key: 'sent', label: 'Sent' },
    { key: 'denied', label: 'Denied' },
  ]
  const statusFilter = ref('all')
  const PAGE = 15
  const shownCount = ref(PAGE)

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

  const filteredRows = computed(() =>
    statusFilter.value === 'all' ? uploadRows.value : uploadRows.value.filter((row) => groupOf(row) === statusFilter.value)
  )

  const remainingRows = computed(() => Math.max(filteredRows.value.length - shownCount.value, 0))

  // "Today", "Yesterday", "Oct 16" (+ the year when it isn't this year)
  function dayTitle(date) {
    const today = new Date()
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
    })
  }

  const visibleDays = computed(() => {
    const days = []
    for (const row of filteredRows.value.slice(0, shownCount.value)) {
      const date = new Date(row.created_at)
      const key = date.toDateString()
      if (days.length === 0 || days[days.length - 1].key !== key) days.push({ key, title: dayTitle(date), rows: [] })
      days[days.length - 1].rows.push(row)
    }
    return days
  })

  function formatTime(date) {
    return new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const uploadRows = computed(() =>
    myUploads.value.map((row) => ({ ...row, state: stateOf(row) }))
  )

  // waiting for approval or not sent yet: the number on the My uploads tab
  const openCount = computed(() => myUploads.value.filter(isOpen).length)

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

  // another filter starts again at the first 15
  watch(statusFilter, () => {
    shownCount.value = PAGE
  })

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
  /* the space left under the top bar (logged-in pill + page padding), so
     the page doesn't scroll when there's nothing more to show */
  .upload-container {
    min-height: calc(100vh - 9rem);
    min-height: calc(100dvh - 9rem);
    display: flex;
    justify-content: center;
    align-items: center;
    background: #090909;
  }

  @media (max-width: 760px) {
    .upload-container {
      min-height: auto;
      padding: 16px 0;
    }

    .upload-content,
    .file-content {
      padding: 28px 16px;
    }
  }

  .drop-box-wrap {
    width: 100%;
    max-width: 520px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  /* 520px wide, but never wider than the screen (phones) */
  .drop-box {
    width: 100%;
    max-width: 520px;
    min-height: 300px;
    display: flex;
    justify-content: center;
    align-items: center;

    background: #111;
    border: 2px dashed #444;
    border-radius: 18px;

    color: white;
    cursor: pointer;

    transition: all 0.25s ease;
  }

  .drop-box:hover {
    border-color: #e50914;
    background: #151515;
    box-shadow: 0 0 30px rgba(229, 9, 20, 0.15);
  }

  .drop-box.dragging {
    border-color: #ff1a25;
    background: #1a0809;
    box-shadow: 0 0 40px rgba(229, 9, 20, 0.35);
    transform: scale(1.02);
  }

  .drop-box.hasFile {
    border-style: solid;
    border-color: #e50914;
  }

  .upload-content,
  .file-content {
    text-align: center;
    padding: 40px;
  }

  .upload-icon,
  .file-icon {
    width: 65px;
    height: 65px;
    margin: 0 auto 20px;

    display: flex;
    justify-content: center;
    align-items: center;

    border-radius: 50%;
    background: #e50914;

    color: white;
    font-size: 32px;
    font-weight: bold;

    box-shadow: 0 0 25px rgba(229, 9, 20, 0.4);
  }

  h2 {
    margin: 0 0 10px;
    font-size: 22px;
  }

  p {
    margin: 0 0 10px;
    color: #999;
  }

  small {
    color: #555;
  }

  .file-content h2 {
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-actions {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .remove-button,
  .upload-button {
    margin-top: 15px;
    padding: 10px 20px;

    background: transparent;
    border: 1px solid #e50914;
    border-radius: 8px;

    color: #e50914;
    cursor: pointer;

    transition: 0.2s;
  }

  .remove-button:hover:not(:disabled),
  .upload-button:hover:not(:disabled) {
    background: #e50914;
    color: white;
  }

  .remove-button:disabled,
  .upload-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .status-msg {
    font-size: 13px;
    text-align: center;
  }

  .status-msg.error {
    color: #ff5a5f;
  }

  .status-msg.success {
    color: #3ddc84;
  }

  .decision-banner {
    width: 100%;
    max-width: 520px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    padding: 14px 18px;
    border-radius: 14px;
    border: 1px solid;
    font-size: 14px;
  }

  .decision-banner.approved {
    background: rgba(61, 220, 132, 0.1);
    border-color: rgba(61, 220, 132, 0.4);
    color: #3ddc84;
  }

  .decision-banner.rejected {
    background: rgba(229, 9, 20, 0.1);
    border-color: rgba(229, 9, 20, 0.4);
    color: #ff5a5f;
  }

  .decision-dismiss {
    background: none;
    border: none;
    color: inherit;
    font-size: 14px;
    cursor: pointer;
    opacity: 0.7;
  }

  .decision-dismiss:hover {
    opacity: 1;
  }

  /* tabs */
  .tabs {
    display: flex;
    gap: 6px;
    padding: 5px;
    border-radius: 14px;
    border: 1px solid #222;
    background: #111;
    align-self: center;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: #999;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s;
  }

  .tab:hover {
    color: #fff;
  }

  .tab.active {
    background: #e50914;
    color: #fff;
  }

  .tab-count {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
    font-size: 12px;
  }

  .my-uploads-empty {
    margin: 0;
    padding: 24px;
    border-radius: 12px;
    border: 1px solid #222;
    background: #111;
    color: #777;
    font-size: 14px;
    text-align: center;
  }

  /* send timer */
  .send-timer {
    width: 100%;
    max-width: 520px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;

    padding: 14px 18px;
    border-radius: 14px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    background: rgba(56, 189, 248, 0.08);
  }

  .send-timer-body {
    min-width: 0;
  }

  .send-timer-name {
    margin: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .send-timer-text {
    margin: 2px 0 0;
    color: #7dd3fc;
    font-size: 13px;
  }

  .send-timer-clock {
    flex-shrink: 0;
    color: #38bdf8;
    font-size: 30px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .send-timer-spinner {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: #38bdf8;
    animation: send-timer-spin 0.9s linear infinite;
  }

  @keyframes send-timer-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .send-timer-spinner {
      animation: none;
    }
  }

  /* my recent uploads */
  .my-uploads {
    width: 100%;
    max-width: 520px;
    margin-top: 6px;
  }

  .my-uploads ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* status filter */
  .filters {
    display: flex;
    gap: 6px;
    margin-bottom: 14px;
    overflow-x: auto;
  }

  .filter {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    padding: 6px 12px;
    border: 1px solid #222;
    border-radius: 999px;
    background: #111;
    color: #999;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .filter:hover {
    color: #fff;
  }

  .filter.active {
    border-color: #e50914;
    background: rgba(229, 9, 20, 0.15);
    color: #fff;
  }

  .filter-count {
    color: #777;
    font-size: 12px;
  }

  .filter.active .filter-count {
    color: #ff8a8f;
  }

  /* one day */
  .day + .day {
    margin-top: 14px;
  }

  .day-title {
    margin: 0 0 6px 4px;
    color: #777;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .day ul {
    overflow: hidden;
    border: 1px solid #222;
    border-radius: 12px;
    background: #111;
  }

  /* one upload: name · time · status, on one line */
  .my-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
  }

  .my-upload + .my-upload {
    border-top: 1px solid #1c1c1c;
  }

  .my-upload-name {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: #eee;
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .my-upload-time {
    flex-shrink: 0;
    color: #777;
    font-size: 12px;
  }

  /* same width for every status, so the times line up */
  .my-upload .chip {
    min-width: 150px;
    text-align: center;
  }

  .show-more {
    display: block;
    margin: 14px auto 0;
    padding: 8px 18px;
    border: 1px solid #222;
    border-radius: 10px;
    background: #111;
    color: #ddd;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .show-more:hover {
    background: #1a1a1a;
  }

  .chip {
    flex-shrink: 0;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .chip.pending {
    background: rgba(245, 185, 66, 0.12);
    color: #f5b942;
  }

  .chip.countdown,
  .chip.sending {
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
  }

  .chip.sent {
    background: rgba(61, 220, 132, 0.12);
    color: #3ddc84;
  }

  .chip.approved {
    background: rgba(255, 255, 255, 0.08);
    color: #bbb;
  }

  .chip.rejected {
    background: rgba(229, 9, 20, 0.12);
    color: #ff5a5f;
  }
  </style>