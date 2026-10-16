  <template>
    <div class="upload-container">
      <div class="drop-box-wrap">
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

        <div
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

        <p v-if="errorMessage" class="status-msg error">{{ errorMessage }}</p>
        <p v-if="successMessage" class="status-msg success">{{ successMessage }}</p>
      </div>
    </div>
  </template>

  <script setup>
  import { onMounted, onUnmounted, ref } from 'vue'
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
    if (!globalThis.crypto?.subtle) return null // very old browser: skip the check

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
      // the row wasn't recorded, so don't leave the file behind either
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
      throw new Error(error.message)
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
    if (!file) return

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

    try {
      await submitSupplierUpload(selectedFile.value)

      successMessage.value = 'Uploaded. The admin has been notified.'
      selectedFile.value = null
      if (fileInput.value) fileInput.value.value = ''
    } catch (err) {
      errorMessage.value = err.message || 'Upload failed. Please try again.'
    } finally {
      uploading.value = false
    }
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
          const { supplier_id, status, file_name } = payload.new

          if (supplier_id !== myId) return
          if (status !== 'approved' && status !== 'rejected') return

          decisionAlert.value = { status, fileName: file_name }
        }
      )
      .subscribe()
  }

  function dismissDecisionAlert() {
    decisionAlert.value = null
  }

  onMounted(() => {
    setupDecisionAlerts()
  })

  onUnmounted(() => {
    if (uploadsChannel) supabase.removeChannel(uploadsChannel)
  })
  </script>

  <style scoped>
  .upload-container {
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background: #090909;
    padding: 30px;
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
  </style>