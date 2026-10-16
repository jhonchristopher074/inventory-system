<template>
  <div>
    <PageHeader
      title="Approval"
      subtitle="Review and approve staff inspection requests."
    />

    <!-- ============================================================
         SUPPLIER UPLOADS
    ============================================================ -->
    <h2 class="mb-3 text-lg font-bold text-white">Supplier Uploads</h2>

    <p v-if="supplierLoading" class="text-sm text-zinc-400">
      Loading supplier uploads...
    </p>

    <p v-if="supplierError" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ supplierError }}
    </p>

    <p v-if="supplierSuccess" class="mb-4 rounded-xl bg-emerald-600/20 p-4 text-emerald-400">
      {{ supplierSuccess }}
    </p>

    <div
      v-if="!supplierLoading && supplierUploads.length === 0"
      class="mb-8 rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No pending supplier uploads.
    </div>

    <div v-else class="mb-8 space-y-5">
      <div
        v-for="upload in supplierUploads"
        :key="upload.id"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
      >
        <div class="flex items-start gap-4">
          <img
            v-if="isImage(upload.file_name)"
            :src="upload.file_url"
            :alt="upload.file_name"
            class="h-20 w-20 flex-shrink-0 rounded-xl object-cover"
          />
          <div
            v-else
            class="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xs font-bold text-zinc-400"
          >
            PDF
          </div>

          <div class="min-w-0 flex-1">
            <a
              :href="upload.file_url"
              target="_blank"
              rel="noopener"
              class="block truncate text-lg font-bold text-white hover:text-red-400"
            >
              {{ upload.file_name }}
            </a>

            <p class="mt-1 text-sm text-zinc-400">
              From: {{ upload.supplier_name || upload.supplier_email || 'Supplier' }}
            </p>

            <p class="mt-1 text-sm text-zinc-400">
              Date: {{ formatDate(upload.created_at) }}
            </p>
          </div>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            :disabled="isBusy(upload.id)"
            @click="approveSupplierUpload(upload)"
          >
            {{ isBusy(upload.id) ? 'Working...' : 'Approve' }}
          </button>

          <button
            class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="isBusy(upload.id)"
            @click="rejectSupplierUpload(upload)"
          >
            Reject
          </button>
        </div>
      </div>
    </div>

    <!-- Approved, but copying to the Approved Receipt bucket failed,
         so n8n never received them. Only shown when there are any. -->
    <div v-if="unsentUploads.length > 0" class="mb-8">
      <h2 class="mb-1 text-lg font-bold text-white">Approved but not sent</h2>
      <p class="mb-3 text-sm text-zinc-400">
        These were approved, but sending them to "{{ APPROVED_BUCKET }}" failed, so the
        receipt scanner (n8n) never received them.
      </p>

      <div class="space-y-3">
        <div
          v-for="upload in unsentUploads"
          :key="upload.id"
          class="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-amber-500/30 bg-zinc-900 p-5"
        >
          <div class="min-w-0">
            <a
              :href="upload.file_url"
              target="_blank"
              rel="noopener"
              class="block truncate font-bold text-white hover:text-red-400"
            >
              {{ upload.file_name }}
            </a>

            <p class="mt-1 text-sm text-zinc-400">
              From: {{ upload.supplier_name || upload.supplier_email || 'Supplier' }}
              · Approved: {{ formatDate(upload.reviewed_at) }}
            </p>
          </div>

          <button
            class="shrink-0 rounded-2xl bg-amber-500 px-5 py-3 font-bold text-black hover:bg-amber-400 disabled:opacity-50"
            :disabled="isBusy(upload.id)"
            @click="resendSupplierUpload(upload)"
          >
            {{ isBusy(upload.id) ? 'Sending...' : 'Send again' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================================
         INSPECTION APPROVALS
    ============================================================ -->
    <h2 class="mb-3 text-lg font-bold text-white">Inspection Approvals</h2>

    <p v-if="loading" class="text-sm text-zinc-400">
      Loading approvals...
    </p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <p
      v-if="successMessage"
      class="mb-4 rounded-xl bg-emerald-600/20 p-4 text-emerald-400"
    >
      {{ successMessage }}
    </p>

    <div
      v-if="!loading && approvals.length === 0"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No pending inspection approvals.
    </div>

    <div v-else class="space-y-5">
      <div
        v-for="approval in approvals"
        :key="approval.id"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
      >
        <h2 class="text-2xl font-bold text-white">
          {{ approval.product_name }}
        </h2>

        <p class="mt-2 text-sm text-zinc-400">
          Requested by: {{ approval.requested_by || 'Staff' }}
        </p>

        <p class="mt-1 text-sm text-zinc-400">
          Date: {{ formatDate(approval.created_at) }}
        </p>

        <div class="mt-4 flex flex-wrap gap-2">
          <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400">
            Approved: {{ approval.approved_qty || 0 }}
          </span>

          <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
            Return: {{ approval.return_qty || 0 }}
          </span>

          <span class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400">
            Submitted
          </span>
        </div>

        <div class="mt-5 flex gap-3">
          <button
            class="rounded-2xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700"
            @click="approveInspection(approval)"
          >
            Approve
          </button>

          <button
            class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
            @click="rejectInspection(approval)"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { supabase, uniqueChannelName } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

/* ------------------------------------------------------------------
   Inspection approvals (unchanged)
------------------------------------------------------------------ */
const approvals = ref([])
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')

async function fetchApprovals() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  const { data, error } = await supabase.rpc('list_submitted_approvals')

  if (error) {
    errorMessage.value = error.message
    approvals.value = []
  } else {
    approvals.value = data || []
  }

  loading.value = false
}

async function approveInspection(approval) {
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase.rpc('approve_inspection', {
    p_approval_id: approval.id,
    p_approved_qty: Number(approval.approved_qty || 0),
    p_return_qty: Number(approval.return_qty || 0),
  })

  if (error) {
    // e.g. "Approved + Return cannot exceed product quantity"
    errorMessage.value = error.message
    return
  }

  successMessage.value = 'Inspection approved successfully.'
  await fetchApprovals()
}

async function rejectInspection(approval) {
  errorMessage.value = ''
  successMessage.value = ''

  const { error } = await supabase.rpc('reject_inspection', {
    p_approval_id: approval.id,
  })

  if (error) {
    errorMessage.value = error.message
    return
  }

  successMessage.value = 'Inspection rejected.'
  await fetchApprovals()
}

/* ------------------------------------------------------------------
   Supplier uploads

   Approve: downloads the file to this device, marks it approved,
   copies it into the "Approved Receipt" bucket (a Supabase Database Webhook
   on that bucket triggers the n8n workflow), then deletes the original.
   Reject: just marks it rejected. SupplierDropBoxView.vue is listening
   for this via realtime and alerts the supplier itself — nothing else
   needs to happen here for that part.

   If the copy fails, the upload is still approved; it's listed under
   "Approved but not sent" until "Send again" gets it through.
------------------------------------------------------------------ */
const BUCKET = 'supplierReceipt'

// Approved receipts are copied here. Anything that lands in this bucket
// triggers the n8n workflow (set up as a Database Webhook in Supabase).
const APPROVED_BUCKET = 'Approved Receipt'

const supplierUploads = ref([])
const unsentUploads = ref([]) // approved, but never reached the Approved Receipt bucket
const supplierLoading = ref(false)
const supplierError = ref('')
const supplierSuccess = ref('')
const busyIds = ref(new Set())

let uploadsChannel = null

function isBusy(id) {
  return busyIds.value.has(id)
}

function isImage(fileName) {
  return /\.(png|jpe?g|webp|gif)$/i.test(fileName || '')
}

async function fetchSupplierUploads() {
  supplierLoading.value = true
  supplierError.value = ''

  const { data, error } = await supabase.rpc('admin_list_supplier_uploads', {
    p_status: 'pending',
  })

  if (error) {
    supplierError.value = error.message
    supplierUploads.value = []
  } else {
    supplierUploads.value = data || []
  }

  supplierLoading.value = false
}

// Reads a file from storage into memory.
async function fetchFile(fileUrl) {
  const response = await fetch(fileUrl)

  if (!response.ok) {
    throw new Error('Could not download the file.')
  }

  return response.blob()
}

// Saves the file to this device before it's deleted from storage —
// once deleted there's no other way to get it back.
async function downloadToDevice(fileUrl, fileName) {
  const blob = await fetchFile(fileUrl)
  const objectUrl = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName || 'supplier-upload'
  document.body.appendChild(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(objectUrl)

  return blob // reused to copy the file into the Approved Receipt bucket
}

// Safe file name for storage: keeps letters, numbers, dot, dash, underscore.
function safeFileName(name) {
  return String(name || 'receipt').replace(/[^A-Za-z0-9._-]+/g, '_')
}

async function approveSupplierUpload(upload) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)

  try {
    // 1. save a copy locally before anything is deleted
    const blob = await downloadToDevice(upload.file_url, upload.file_name)

    // 2. mark approved
    const { data: approved, error } = await supabase.rpc('admin_approve_supplier_upload', {
      p_upload_id: upload.id,
    })

    if (error) throw new Error(error.message)

    supplierUploads.value = supplierUploads.value.filter((item) => item.id !== upload.id)

    // 3. send it on to n8n, then remove the original
    try {
      const { deleteFailed } = await forwardReceipt(approved, blob)

      supplierSuccess.value = deleteFailed
        ? `Approved "${upload.file_name}", saved it to your device and sent it to ${APPROVED_BUCKET}, but the original is still in storage — check the bucket's delete policy.`
        : `Approved "${upload.file_name}", saved it to your device, sent it to ${APPROVED_BUCKET} and removed the original.`
    } catch (sendError) {
      // Approved, but not sent: the original stays in storage and the
      // upload is listed under "Approved but not sent" for another try.
      console.error('Approved, but could not send to the Approved Receipt bucket:', sendError)
      supplierError.value = sendError.alreadySent
        ? `"${upload.file_name}" was approved and sent to "${APPROVED_BUCKET}", but the app ` +
          `couldn't record that it was sent (${sendError.message}). If it's listed under ` +
          `"Approved but not sent", press "Send again": that only records it, it won't be sent twice.`
        : `"${upload.file_name}" was approved and saved to your device, but sending it to ` +
          `"${APPROVED_BUCKET}" failed (${sendError.message}). It's listed under ` +
          `"Approved but not sent" — press "Send again" to retry.`
      await fetchUnsentUploads()
    }
  } catch (err) {
    supplierError.value = err.message || 'Something went wrong approving this upload.'
  } finally {
    busyIds.value.delete(upload.id)
  }
}

// Copies an approved receipt into the "Approved Receipt" bucket (that copy
// is what triggers n8n), records it as sent, then removes the original.
// Throws when it couldn't be sent and recorded; the original is kept then,
// so "Send again" can still read it.
async function forwardReceipt(upload, blob) {
  const approvedPath = `${upload.id}-${safeFileName(upload.file_name)}`

  const { error: uploadError } = await supabase.storage
    .from(APPROVED_BUCKET)
    .upload(approvedPath, blob, {
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
    .from(BUCKET)
    .remove([upload.file_path])

  // .remove() can resolve with no error but an empty `removed` array —
  // that also means nothing was actually deleted (e.g. a storage RLS
  // policy silently blocked it), so both cases are checked here rather
  // than just the error.
  const deleteFailed = Boolean(removeError || !removed || removed.length === 0)

  if (deleteFailed) {
    console.error('Sent, but failed to delete the original from storage:', removeError)
  }

  return { deleteFailed }
}

function isAlreadyExists(error) {
  return (
    String(error?.statusCode) === '409' ||
    error?.status === 409 ||
    /already exists|duplicate/i.test(error?.message || '')
  )
}

async function fetchUnsentUploads() {
  const { data, error } = await supabase.rpc('admin_list_unsent_supplier_uploads')

  if (error) {
    // e.g. the 2026-10-15 SQL file hasn't been run yet: just hide the list
    console.error(error)
    unsentUploads.value = []
    return
  }

  unsentUploads.value = data || []
}

async function resendSupplierUpload(upload) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)

  try {
    const blob = await fetchFile(upload.file_url)
    const { deleteFailed } = await forwardReceipt(upload, blob)

    unsentUploads.value = unsentUploads.value.filter((item) => item.id !== upload.id)

    supplierSuccess.value = deleteFailed
      ? `Sent "${upload.file_name}" to ${APPROVED_BUCKET}, but the original is still in storage — check the bucket's delete policy.`
      : `Sent "${upload.file_name}" to ${APPROVED_BUCKET} and removed the original.`
  } catch (err) {
    supplierError.value = `Sending "${upload.file_name}" failed again: ${err.message || err}`
  } finally {
    busyIds.value.delete(upload.id)
  }
}

async function rejectSupplierUpload(upload) {
  supplierError.value = ''
  supplierSuccess.value = ''
  busyIds.value.add(upload.id)

  const { error } = await supabase.rpc('admin_reject_supplier_upload', {
    p_upload_id: upload.id,
  })

  if (error) {
    busyIds.value.delete(upload.id)
    supplierError.value = error.message
    return
  }

  // rejected uploads aren't kept — delete the file from storage too
  const { data: removed, error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([upload.file_path])

  // .remove() can resolve with no error but an empty `removed` array —
  // that also means nothing was actually deleted (e.g. a storage RLS
  // policy silently blocked it), so both cases are checked here rather
  // than just the error.
  const deleteFailed = removeError || !removed || removed.length === 0

  if (deleteFailed) {
    console.error('Rejected, but failed to delete file from storage:', removeError)
  }

  busyIds.value.delete(upload.id)

  supplierSuccess.value = deleteFailed
    ? `Rejected "${upload.file_name}", but it's still sitting in storage — check the bucket's delete policy.`
    : `Rejected "${upload.file_name}" and removed it from storage.`

  supplierUploads.value = supplierUploads.value.filter((item) => item.id !== upload.id)
}

// New uploads show up here the moment a supplier submits one, without
// needing a manual refresh.
function setupSupplierRealtime() {
  uploadsChannel = supabase
    .channel(uniqueChannelName('supplier-uploads-admin'))
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'supplier_uploads' },
      (payload) => {
        if (payload.new.status === 'pending') {
          fetchSupplierUploads()
        }
      }
    )
    .subscribe()
}

/* ------------------------------------------------------------------ */
function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

onMounted(() => {
  fetchApprovals()
  fetchSupplierUploads()
  fetchUnsentUploads()
  setupSupplierRealtime()
})

onUnmounted(() => {
  if (uploadsChannel) supabase.removeChannel(uploadsChannel)
})
</script>