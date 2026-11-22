<template>
  <div>
    <PageHeader
      title="Documentation"
    />

    <!-- type tabs (a new page scrolls back up to here) -->
    <div
      ref="tabsRow"
      class="-mx-1 mb-5 flex scroll-mt-4 gap-2 overflow-x-auto px-1 pb-1 sm:mb-6 sm:flex-wrap sm:gap-3 sm:overflow-visible"
    >
      <button
        v-for="type in documentTypes"
        :key="type"
        class="shrink-0 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-bold transition sm:px-5 sm:py-3 sm:text-base"
        :class="selectedType === type
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'"
        @click="selectedType = type"
      >
        {{ type }}
      </button>
    </div>

    <p v-if="loading" class="text-sm text-zinc-400">
      Loading documents...
    </p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="!loading && filteredDocuments.length === 0"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No documents found.
    </div>

    <!-- every card is the same size: fixed picture, title of 2 lines and
         description of 3 lines at most. The whole card is the button.
         Columns follow the width of the page area (not the whole window, which
         also holds the sidebar): 2 (phones, smaller cards), 3, then 4 per
         row on wide screens. -->
    <div class="@container">
      <div class="grid grid-cols-2 gap-3 @min-[600px]:gap-5 @min-[880px]:grid-cols-3 @min-[1100px]:grid-cols-4">
        <div
          v-for="document in visibleDocuments"
          :key="document.id"
          role="button"
          tabindex="0"
          :aria-label="'View details of ' + (document.title || document.type || 'document')"
          class="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-white/10 bg-zinc-900 p-2.5 shadow-xl transition duration-200 hover:-translate-y-1 hover:border-red-500/60 hover:bg-zinc-800/80 hover:shadow-2xl hover:shadow-red-900/30 focus:outline-none focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500 active:translate-y-0 active:scale-[0.99] @min-[600px]:rounded-[24px] @min-[600px]:p-5"
          @click="openDocument(document)"
          @keydown.enter.prevent="openDocument(document)"
          @keydown.space.prevent="openDocument(document)"
        >
          <div
            class="mb-2 flex h-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black @min-[600px]:mb-4 @min-[600px]:h-40 @min-[600px]:rounded-2xl"
          >
            <img
              v-if="documentImage(document)"
              :src="documentImage(document)"
              loading="lazy"
              @error="pictureFailed(document)"
              class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />

            <span v-else class="text-sm text-zinc-500">
              No Image
            </span>
          </div>

          <div class="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 @min-[600px]:mb-3">
            <span
              class="max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-bold @min-[600px]:px-3 @min-[600px]:py-1 @min-[600px]:text-xs"
              :class="badgeClass(document.type)"
            >
              {{ document.type || 'Document' }}
            </span>

            <span class="text-[10px] text-zinc-500 @min-[600px]:text-xs">
              {{ formatDate(document.created_at) }}
            </span>
          </div>

          <h2 class="line-clamp-2 min-h-[2.75em] text-sm font-bold leading-snug text-white @min-[600px]:text-xl @min-[1100px]:text-lg">
            {{ document.title || document.type || 'Untitled Document' }}
          </h2>

          <p class="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-zinc-400 @min-[600px]:mt-2 @min-[600px]:line-clamp-3 @min-[600px]:min-h-[4.5rem] @min-[600px]:text-sm @min-[600px]:leading-6">
            {{ document.description || 'No description provided.' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 16 or 24 documents a page (4 full rows), or all of them -->
    <TablePager
      v-if="filteredDocuments.length > 0"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="filteredDocuments.length"
      :sizes="GRID_PAGE_SIZES"
      label="Per page"
      noun="documents"
      card
      class="mt-5"
    />

    <!-- VIEW MODAL: the same size for every document and never taller than
         the screen, so the window itself doesn't scroll. The picture takes
         the space that's left (always whole, never cut off); only a very
         long description scrolls, inside its own box. -->
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4"
      @click.self="closeDocument"
    >
      <div
        class="flex h-[min(760px,92vh)] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-4 sm:gap-4 sm:rounded-[24px] sm:p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="selectedDocument.title || 'Document details'"
      >
        <div class="flex shrink-0 items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="line-clamp-2 text-lg font-bold text-white sm:text-2xl">
              {{ selectedDocument.title || selectedDocument.type || 'Document Details' }}
            </h2>

            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                class="rounded-full px-3 py-1 text-xs font-bold"
                :class="badgeClass(selectedDocument.type)"
              >
                {{ selectedDocument.type || 'Document' }}
              </span>

              <span v-if="selectedDocument.created_at" class="text-sm text-zinc-400">
                {{ formatDate(selectedDocument.created_at) }}
              </span>
            </div>
          </div>

          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="closeDocument"
          >
            ✕
          </button>
        </div>

        <!-- tap the picture to see it full screen, here in the app (e.g. to
             read a receipt); ✕, Esc or a tap closes it -->
        <div
          v-if="documentImage(selectedDocument)"
          class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            :src="documentImage(selectedDocument)"
            :alt="selectedDocument.title || 'Document picture'"
            @error="pictureFailed(selectedDocument)"
            class="h-full w-full object-contain"
          />
          <PreviewButton :src="documentImage(selectedDocument)" :alt="selectedDocument.title || 'Document picture'" />
        </div>

        <!-- a receipt that is a PDF: open the file -->
        <a
          v-else-if="selectedDocument.file_url"
          :href="selectedDocument.file_url"
          target="_blank"
          rel="noopener"
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-black text-sm font-bold text-blue-400 hover:text-white"
        >
          Open the receipt file
          <span class="text-xs font-normal text-zinc-500">{{ selectedDocument.file_name }}</span>
        </a>

        <!-- no picture: a small strip, the details get the room -->
        <div
          v-else
          class="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-black text-sm text-zinc-500"
        >
          No Image
        </div>

        <!-- A receipt: what came of it, its details, then every line the
             scanner read. More room than other documents. -->
        <div
          v-if="selectedView"
          class="shrink-0 space-y-4 overflow-y-auto rounded-2xl bg-black p-4"
          :class="!documentImage(selectedDocument) && !selectedDocument.file_url
            ? 'min-h-0 flex-1'
            : selectedDocument.receipt ? 'h-[48%]' : 'h-[42%]'"
        >
          <p
            v-if="selectedView.summary"
            class="rounded-xl px-3 py-2 text-sm font-bold"
            :class="selectedView.summaryTone"
          >
            {{ selectedView.summary }}
          </p>

          <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <template v-for="(row, i) in selectedView.details" :key="i">
              <dt class="text-zinc-500">{{ row[0] }}</dt>
              <dd class="min-w-0 break-words text-zinc-200">{{ row[1] }}</dd>
            </template>
          </dl>

          <!-- a refund's items -->
          <ul v-if="selectedView.items.length" class="divide-y divide-white/5 rounded-xl border border-white/10">
            <li v-for="(item, i) in selectedView.items" :key="i" class="px-3 py-2.5 text-sm font-bold text-white">
              {{ item }}
            </li>
          </ul>

          <div v-if="selectedView.paragraphs.length" class="space-y-1.5">
            <p class="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Description</p>
            <p v-for="(text, i) in selectedView.paragraphs" :key="i" class="whitespace-pre-line text-sm leading-6 text-zinc-300">
              {{ text }}
            </p>
          </div>

          <div v-if="selectedView.products.length">
            <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">
              Read by the receipt scanner · {{ selectedView.products.length }}
              {{ selectedView.products.length === 1 ? 'product' : 'products' }}
            </p>
            <ul class="divide-y divide-white/5 rounded-xl border border-white/10">
              <li
                v-for="(item, i) in selectedView.products"
                :key="i"
                class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2.5"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-white">
                    <span class="text-zinc-400">{{ count(item.qty_added) }} ×</span> {{ item.product_name }}
                    <span v-if="item.is_new" class="ml-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">New</span>
                  </p>
                  <p class="mt-0.5 text-xs text-zinc-500">
                    <template v-if="item.cost != null">Cost {{ peso(item.cost) }}</template>
                    <template v-if="item.cost != null && Number(item.price) > 0"> · </template>
                    <template v-if="Number(item.price) > 0">Price {{ peso(item.price) }}</template>
                  </p>
                </div>
                <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" :class="STATE_TONES[item.state]">
                  {{ STATE_WORDS[item.state] || item.state }}
                </span>
              </li>
            </ul>
          </div>

          <p v-else-if="selectedView.empty" class="text-sm text-zinc-500">{{ selectedView.empty }}</p>

          <p v-if="selectedView.note" class="text-sm text-zinc-400">
            <span class="font-bold text-zinc-300">Note:</span> {{ selectedView.note }}
          </p>
        </div>

        <button
          class="w-full shrink-0 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
          @click="closeDocument"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { GRID_PAGE_SIZES, usePagination } from '../../lib/usePagination'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'
import PreviewButton from '../../components/PreviewButton.vue'
import { count, peso } from '../../lib/format'
import { listRefundDocuments } from '../../lib/refunds'
import { DOCUMENT_TYPES, documentTypeClass } from '../../lib/documentTypes'
import { APPROVED_BUCKET, LINK_SECONDS, RECEIPT_BUCKET, approvedCopyName, isImageFile, keptCopyUrl } from '../../lib/receipts'

const documents = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selectedType = ref('All')
const selectedDocument = ref(null)

// a tab for every type (lib/documentTypes.js), so the ones staff make
// (Staff > Documentation) aren't only found under "All"
const documentTypes = ['All', ...DOCUMENT_TYPES]

onMounted(fetchDocuments)

async function fetchDocuments() {
  loading.value = true
  errorMessage.value = ''

  const [{ data, error }, refunds, receipts] = await Promise.all([
    supabase.rpc('list_documentations'),
    // approved refunds, shown as documents (lib/refunds.js)
    listRefundDocuments().catch((err) => {
      console.error(err)
      return []
    }),
    // approved receipts from suppliers and staff, shown as Order Receipts
    receiptDocuments().catch((err) => {
      console.error(err)
      return []
    }),
  ])

  if (error) {
    errorMessage.value = error.message
    documents.value = []
  } else {
    documents.value = [...(data || []), ...refunds.map(refundDocument), ...receipts].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    )
  }

  loading.value = false
}

const filteredDocuments = computed(() => {
  if (selectedType.value === 'All') {
    return documents.value
  }

  return documents.value.filter(document => {
    return document.type === selectedType.value
  })
})

// 16 or 24 documents a page (4 full rows of 4), or all of them. The choice
// is remembered on this device.
const tabsRow = ref(null)
const {
  page,
  pageSize,
  visible: visibleDocuments,
  reset: resetPage,
} = usePagination(filteredDocuments, {
  storageKey: 'documentation',
  scrollTarget: tabsRow,
  sizes: GRID_PAGE_SIZES,
})

// another tab starts again at page 1
watch(selectedType, resetPage)

// an approved refund as a document card
function refundDocument(request) {
  const items = (request.items || []).map((item) => `${count(item.quantity)} × ${item.product_name} (${peso(item.amount)})`)
  return {
    id: `refund-${request.id}`,
    type: 'Refunded',
    title: `Refund · Sale #${request.sale_id}`,
    created_at: request.decided_at || request.created_at,
    description: [
      `${peso(request.amount)} given back to the customer; the pieces went back into stock.`,
      ...items,
      `Refunded by ${request.requested_by_name || 'a cashier'} on ${formatDate(request.created_at)}` +
        `${request.decided_by_name && request.decided_by_name !== request.requested_by_name ? `, approved by ${request.decided_by_name}` : ''}.`,
      request.note ? `Why: ${request.note}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

// Receipts the owner approved (from a supplier or a staff member), as Order
// Receipt cards. The picture is the approved copy once it was sent to the
// scanner, before that the upload itself (lib/receipts.js). A PDF has no
// picture: the window links to the file instead.
async function receiptDocuments() {
  const [{ data, error }, results] = await Promise.all([
    supabase.rpc('admin_list_supplier_uploads', { p_status: 'approved' }),
    receiptProducts(),
  ])
  if (error) throw error
  // Only receipts that are done: some of their products in stock, and none
  // still waiting for prices (Approval > Prices to check). Until the SQL
  // for the scanner's lines is run (results === null), every approved one.
  const uploads = (data || []).filter((upload) => {
    if (results === null) return true
    const lines = results.get(String(upload.id)) || []
    return lines.some((line) => line.state === 'added') && !lines.some((line) => line.state === 'waiting')
  })

  const where = (upload) =>
    upload.forwarded_at
      ? { bucket: APPROVED_BUCKET, path: approvedCopyName(upload) }
      : { bucket: RECEIPT_BUCKET, path: upload.file_path }

  // Approved Receipt is a public bucket: its plain link. supplierReceipt is
  // private: signed links, one request for all of them.
  const links = new Map()
  for (const file of uploads.map(where)) {
    if (file.bucket === APPROVED_BUCKET && file.path) {
      links.set(`${file.bucket}/${file.path}`, supabase.storage.from(APPROVED_BUCKET).getPublicUrl(file.path).data.publicUrl)
    }
  }
  const privatePaths = uploads.map(where).filter((file) => file.bucket === RECEIPT_BUCKET && file.path).map((file) => file.path)
  if (privatePaths.length > 0) {
    const { data: signed } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(privatePaths, LINK_SECONDS)
    for (const row of signed || []) if (row.signedUrl) links.set(`${RECEIPT_BUCKET}/${row.path}`, row.signedUrl)
  }

  return uploads.map((upload) => {
    const file = where(upload)
    const url = links.get(`${file.bucket}/${file.path}`) || ''
    const supplier = upload.supplier_name || 'a supplier'
    const byStaff = upload.uploader_role && upload.uploader_role !== 'supplier'
    const products = results?.get(String(upload.id)) || []
    // Documentation's own copy first (kept since receipts are approved with
    // it), then the scanner's or the original, which get removed: a picture
    // that won't load moves on to the next (pictureFailed)
    const pictures = isImageFile(upload.file_name) ? [keptCopyUrl(upload), url].filter(Boolean) : []
    return {
      id: `receipt-${upload.id}`,
      type: 'Order Receipt',
      title: `Receipt from ${supplier}`,
      created_at: upload.reviewed_at || upload.created_at,
      receipt_image_url: pictures[0] || '',
      pictures,
      file_url: url,
      file_name: upload.file_name,
      // the window's own layout (summary, details, the scanner's lines)
      receipt: {
        ...receiptSummary(products, upload),
        details: [
          [byStaff ? 'Uploaded by' : 'Sent by', `${byStaff ? upload.uploader_name || 'a staff member' : upload.uploader_name || supplier} (${byStaff ? 'staff' : 'supplier'})`],
          ['Supplier', supplier],
          ['Sent on', formatDate(upload.created_at)],
          ['Approved on', `${formatDate(upload.reviewed_at || upload.created_at)}${upload.forwarded_at ? ' · sent to the scanner' : ''}`],
          ...(upload.delivery_title ? [['Delivery', upload.delivery_title]] : []),
          ['File', upload.file_name || 'receipt'],
        ],
        products,
        note: upload.note || '',
        empty: upload.forwarded_at ? 'The receipt scanner has no products from this receipt yet.' : 'Not sent to the receipt scanner yet.',
      },
      // the card: what came of it first, then who sent it
      description: [
        receiptSummary(products, upload).summary,
        `${byStaff ? 'Uploaded by' : 'Sent by'} ${byStaff ? upload.uploader_name || 'a staff member' : upload.uploader_name || supplier} on ${formatDate(upload.created_at)}.`,
      ].join('\n'),
    }
  })
}

/* ------------------------------------------------------------------
   The window's layout, the same for every type: a coloured line saying
   what it is about, the details (label and value), then lines (the
   scanner's products, a refund's items) and any free text. A receipt
   brings its own (receiptDocuments); the others are read from their
   description, as the database writes it.
------------------------------------------------------------------ */
const TONE = {
  good: 'bg-emerald-500/15 text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-300',
  bad: 'bg-red-600/15 text-red-400',
  info: 'bg-sky-500/15 text-sky-300',
  plain: 'bg-white/5 text-zinc-300',
}

const selectedView = computed(() => {
  const doc = selectedDocument.value
  if (!doc) return null
  if (doc.receipt) return { items: [], paragraphs: [], ...doc.receipt }
  return describe(doc)
})

function describe(doc) {
  const lines = String(doc.description || '').split('\n').map((line) => line.trim()).filter(Boolean)
  const details = []
  const items = []
  const paragraphs = []
  let summary = ''
  let summaryTone = TONE.plain

  if (doc.type === 'Product Report') {
    // "Reported by Steve. Issue: Damaged Item. Details: ..."
    const match = lines.join(' ').match(/^Reported by (.+?)\. Issue: (.+?)\. Details: ([\s\S]*)$/)
    if (match) {
      summary = `Reported: ${match[2]}`
      details.push(['Reported by', match[1]])
      paragraphs.push(match[3])
    } else {
      paragraphs.push(...lines)
    }
    summary = summary || 'A problem was reported with this product.'
    summaryTone = TONE.bad
  } else if (doc.type === 'Refunded') {
    // money back, then "2 × Cement (₱560.00)" lines, "Refunded by …", "Why: …"
    for (const line of lines) {
      if (/^\d[\d,]* × /.test(line)) items.push(line)
      else if (/^Why: /.test(line)) details.push(['Reason', line.slice(5)])
      else if (/^Refunded by /.test(line)) details.push(['Refunded by', line.slice(12).replace(/\.$/, '')])
      else if (!summary) summary = line
      else paragraphs.push(line)
    }
    summaryTone = TONE.warn
  } else {
    // "Label: value" lines become details; the first plain sentence is the summary
    for (const line of lines) {
      const pair = line.match(/^([A-Za-z][A-Za-z ]{0,28}):\s*(.+)$/)
      if (pair) details.push([pair[1], pair[2]])
      else if (!summary && doc.type === 'Inspection Document') summary = line
      else paragraphs.push(line)
    }
    if (doc.type === 'Inspection Document') {
      const result = details.find((row) => row[0] === 'Result')?.[1] || ''
      summaryTone = /with returns/i.test(result) ? TONE.warn : /return/i.test(result) ? TONE.bad : TONE.good
      if (!summary) summary = result ? `Inspection result: ${result}` : 'Inspection result'
    }
  }

  // what every record has
  if (doc.product_name && !details.some((row) => row[0] === 'Product')) details.unshift(['Product', doc.product_name])
  if (doc.created_by && !details.some((row) => /by$/i.test(row[0]))) details.push(['Recorded by', doc.created_by])
  details.push(['Date', formatDate(doc.created_at)])

  return {
    summary,
    summaryTone,
    details,
    items,
    paragraphs: paragraphs.length || items.length || details.length > 1 ? paragraphs : ['No description provided.'],
    products: [],
    note: '',
    empty: '',
  }
}

// each line's state, in words and colours
const STATE_WORDS = {
  added: 'Added to stock',
  waiting: 'Prices not checked',
  'not added': 'Not in stock yet',
  rejected: 'Rejected',
}

const STATE_TONES = {
  added: 'bg-emerald-500/15 text-emerald-400',
  waiting: 'bg-amber-500/15 text-amber-300',
  'not added': 'bg-sky-500/15 text-sky-300',
  rejected: 'bg-red-600/15 text-red-400',
}

// what came of the scanner's reading, in one sentence, and its colour
function receiptSummary(products, upload) {
  const n = products.length
  const read = `${n} ${n === 1 ? 'product' : 'products'}`
  if (n === 0) {
    return {
      summary: upload.forwarded_at ? 'Waiting for the receipt scanner.' : 'Approved, not sent to the scanner yet.',
      summaryTone: 'bg-white/5 text-zinc-300',
    }
  }
  const added = products.filter((p) => p.state === 'added')
  if (added.length === n) return { summary: `All ${read} added to the inventory.`, summaryTone: STATE_TONES.added }
  if (added.length > 0) return { summary: `${added.length} of ${read} added to the inventory.`, summaryTone: STATE_TONES.added }
  if (products.some((p) => p.state === 'waiting')) {
    return { summary: `The scanner read ${read}. Check the prices in Approval to add them.`, summaryTone: STATE_TONES.waiting }
  }
  return { summary: `The scanner read ${read}. None added to stock.`, summaryTone: STATE_TONES.rejected }
}

// What the scanner read from each receipt, by receipt
// (admin_list_receipt_results: migration 20261124000001). Until that SQL is
// run, the cards just don't list products.
async function receiptProducts() {
  const byUpload = new Map()
  const { data, error } = await supabase.rpc('admin_list_receipt_results')
  if (error) {
    console.warn('Products per receipt not shown:', error.message)
    return null
  }
  for (const row of data || []) {
    const key = String(row.upload_id)
    if (!byUpload.has(key)) byUpload.set(key, [])
    byUpload.get(key).push(row)
  }
  return byUpload
}

// a picture that doesn't load (removed from storage): try the next copy,
// or show "No Image"
function pictureFailed(document) {
  const rest = (document.pictures || []).filter((url) => url !== document.receipt_image_url)
  document.pictures = rest
  document.receipt_image_url = rest[0] || ''
  // no copy of the picture left: its file link is gone too
  if (rest.length === 0 && document.receipt) document.file_url = ''
}

function openDocument(document) {
  selectedDocument.value = document
}

// a document's picture: receipt_image_url, or image_url when that's empty
function documentImage(document) {
  return document?.receipt_image_url || document?.image_url || ''
}

function closeDocument() {
  selectedDocument.value = null
}

// each type's tag colour, the same as on the Staff's page
const badgeClass = documentTypeClass

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>