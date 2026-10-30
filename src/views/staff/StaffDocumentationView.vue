<template>
  <!-- pb-24: room under the page buttons for the + button, which stays at
       the bottom right of the screen -->
  <div class="min-h-screen pb-24 text-white">
    <PageHeader
      title="Employee Documentation"
      subtitle="Create and view your own documentation records."
    />

    <!-- DOCUMENT GRID: up to 4 a row. The columns follow the width of the
         page area, not the whole window (which also holds the sidebar). -->
    <div ref="gridTop" class="@container mt-6 scroll-mt-4">
      <div class="grid gap-4 @min-[600px]:grid-cols-2 @min-[880px]:grid-cols-3 @min-[1100px]:grid-cols-4">
        <div
          v-for="doc in visibleDocuments"
          :key="doc.id"
          class="card flex flex-col p-4 transition hover:border-red-500/40"
        >
          <!-- IMAGE -->
          <div
            class="mb-3 flex h-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black"
          >
            <img
              v-if="doc.receipt_image_url || doc.image_url"
              :src="doc.receipt_image_url || doc.image_url"
              loading="lazy"
              class="h-full w-full object-cover"
            />
            <div v-else class="flex flex-col items-center gap-1 text-zinc-600">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="text-[11px] uppercase tracking-wide">No image</span>
            </div>
          </div>

          <!-- TYPE -->
          <div class="self-start rounded-full bg-red-950 px-3 py-1 text-[11px] font-bold text-red-400">
            {{ doc.type || 'Staff Documentation' }}
          </div>

          <!-- TITLE -->
          <h2 class="mt-2 line-clamp-2 min-h-[2.75em] text-base font-bold leading-snug text-white">
            {{ doc.title || 'Untitled Document' }}
          </h2>

          <!-- PRODUCT -->
          <p class="mt-1 min-h-[1.5em] text-xs font-semibold text-yellow-400 line-clamp-1">
            {{ doc.product_name }}
          </p>

          <!-- DESCRIPTION -->
          <p class="mt-1 line-clamp-2 min-h-[3em] text-xs leading-normal text-zinc-500">
            {{ doc.description || 'No description.' }}
          </p>

          <!-- DATE -->
          <p class="mb-3 mt-2 text-[11px] text-zinc-600">
            {{ formatDate(doc.created_at) }}
          </p>

          <!-- OPEN -->
          <button
            class="mt-auto w-full rounded-xl bg-red-600 py-2 text-sm font-bold text-white transition hover:bg-red-700"
            @click="openDocument(doc)"
          >
            Open
          </button>
        </div>
      </div>
    </div>

    <p v-if="!loading && documents.length === 0" class="card p-5 text-zinc-400">
      No documentation yet. Press + to add one.
    </p>

    <!-- 16 or 24 documents a page (4 full rows), or all of them -->
    <TablePager
      v-if="documents.length > 0"
      v-model:page="page"
      v-model:page-size="pageSize"
      :total="documents.length"
      :sizes="GRID_PAGE_SIZES"
      label="Per page"
      noun="documents"
      card
      class="mt-5"
    />

    <!-- PLUS BUTTON -->
    <button
      class="fixed bottom-8 right-8 z-40 flex h-14 w-14 items-center justify-center rounded-[14px] bg-red-600 text-3xl font-black text-white shadow-[0_0_20px_rgba(239,68,68,0.4)] transition hover:scale-105 hover:bg-red-700"
      @click="showAddModal = true"
    >
      +
    </button>

    <!-- ADD MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div class="max-h-[92vh] w-full max-w-lg overflow-y-auto card p-5">
        <h2 class="text-2xl font-black text-white">Add Documentation</h2>

        <div class="mt-5 space-y-4">
          <!-- TITLE -->
          <div>
            <label class="mb-1 block text-sm font-bold text-white">Title</label>
            <input
              v-model="newDoc.title"
              type="text"
              placeholder="Enter title"
              class="w-full rounded-xl border border-white/10 bg-zinc-800 p-3 text-sm text-white outline-none focus:border-red-500"
            />
          </div>

          <!-- TYPE -->
          <div>
            <label class="mb-1 block text-sm font-bold text-white">Type</label>
            <select
              v-model="newDoc.type"
              class="w-full rounded-xl border border-white/10 bg-zinc-800 p-3 text-sm text-white outline-none focus:border-red-500"
            >
              <option>Staff Documentation</option>
              <option>Product Report</option>
              <option>Inspection Note</option>
            </select>
          </div>

          <!-- PRODUCT -->
          <div v-if="newDoc.type === 'Product Report'">
            <label class="mb-1 block text-sm font-bold text-white">Product</label>
            <div class="relative">
              <button
                class="flex w-full items-center justify-between rounded-xl border border-white/10 bg-zinc-800 p-3 text-left text-sm text-white"
                @click="showProductDropdown = !showProductDropdown"
              >
                <span>{{ selectedProductName || 'Search product...' }}</span>
                <span class="text-red-400">{{ showProductDropdown ? '⌃' : '⌄' }}</span>
              </button>

              <div
                v-if="showProductDropdown"
                class="absolute z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-2 shadow-2xl"
              >
                <input
                  v-model="productSearch"
                  type="text"
                  placeholder="Search product..."
                  class="mb-2 w-full rounded-lg border border-white/10 bg-zinc-800 p-2 text-sm text-white outline-none"
                />
                <button
                  v-for="product in filteredProducts"
                  :key="product.id"
                  class="mb-1 w-full rounded-lg p-2 text-left transition hover:bg-zinc-800"
                  @click="selectProduct(product)"
                >
                  <p class="text-sm font-bold text-white">{{ product.name }}</p>
                  <p class="text-xs text-zinc-400">{{ product.category }}</p>
                </button>
              </div>
            </div>
          </div>

          <!-- PHOTO -->
          <div>
            <label class="mb-1 block text-sm font-bold text-white">Photo Attachment</label>
            <input
              type="file"
              accept="image/*"
              class="w-full rounded-xl border border-white/10 bg-zinc-800 p-3 text-sm text-white"
              @change="handleFileChange"
            />
          </div>

          <!-- DESCRIPTION -->
          <div>
            <label class="mb-1 block text-sm font-bold text-white">Description</label>
            <textarea
              v-model="newDoc.description"
              rows="4"
              placeholder="Enter description"
              class="w-full resize-none rounded-xl border border-white/10 bg-zinc-800 p-3 text-sm text-white outline-none focus:border-red-500"
            ></textarea>
          </div>

          <!-- ERROR -->
          <div v-if="modalError" class="rounded-xl bg-red-950 p-3 text-sm text-red-300">
            {{ modalError }}
          </div>

          <!-- BUTTONS -->
          <div class="grid grid-cols-2 gap-3">
            <button
              class="rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              :disabled="uploading"
              @click="saveDocument"
            >
              {{ uploading ? 'Saving...' : 'Save' }}
            </button>
            <button
              class="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
              @click="closeAddModal"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- VIEW MODAL -->
    <!-- Fits the screen and scrolls inside; the title row with × stays on top.
         (It used to be taller than a phone screen with no way to scroll, so
         neither × nor Close could be reached.) Tapping outside closes it. -->
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
      @click.self="closeDocument"
    >
      <!-- same size for every document and never taller than the screen, so
           it doesn't scroll: the picture takes the space that's left (always
           whole); only a very long description scrolls in its own box -->
      <div
        class="card flex h-[min(760px,92vh)] w-full max-w-xl flex-col gap-3 overflow-hidden p-4 sm:p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="selectedDocument.title || 'Document'"
      >
        <!-- HEADER -->
        <div class="flex shrink-0 items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="line-clamp-2 break-words text-xl font-black text-white sm:text-2xl">{{ selectedDocument.title }}</h2>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span class="rounded-full bg-red-950 px-3 py-1 text-[11px] font-bold text-red-400">
                {{ selectedDocument.type }}
              </span>
              <span class="text-xs text-zinc-500">{{ formatDate(selectedDocument.created_at) }}</span>
            </div>
          </div>
          <button
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20"
            aria-label="Close"
            @click="closeDocument"
          >
            ×
          </button>
        </div>

        <!-- IMAGE: tap to open it full size -->
        <a
          v-if="selectedDocument.receipt_image_url || selectedDocument.image_url"
          :href="selectedDocument.receipt_image_url || selectedDocument.image_url"
          target="_blank"
          rel="noopener"
          title="Open the full picture"
          class="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[16px] bg-black"
        >
          <img
            :src="selectedDocument.receipt_image_url || selectedDocument.image_url"
            :alt="selectedDocument.title || 'Document picture'"
            class="h-full w-full object-contain"
          />
        </a>
        <div
          v-else
          class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-[16px] bg-black text-zinc-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span class="text-[11px] uppercase tracking-wide">No image attached</span>
        </div>

        <!-- CONTENT -->
        <div class="h-[26%] shrink-0 overflow-y-auto rounded-[16px] bg-black p-4">
          <div v-if="selectedDocument.product_name" class="mb-2 text-sm font-bold text-yellow-400">
            {{ selectedDocument.product_name }}
          </div>
          <p class="whitespace-pre-line text-sm leading-5 text-white">{{ selectedDocument.description }}</p>
        </div>

        <!-- ADD / CHANGE PHOTO: one row -->
        <div class="shrink-0">
          <div class="flex gap-2">
            <input
              type="file"
              accept="image/*"
              aria-label="Add or change photo"
              class="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-800 p-2.5 text-sm text-white"
              @change="handleUpdatePhoto"
            />
            <button
              class="shrink-0 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              :disabled="updatingPhoto"
              @click="updateDocumentPhoto"
            >
              {{ updatingPhoto ? 'Uploading...' : 'Save Photo' }}
            </button>
          </div>
          <p v-if="viewError" class="mt-2 rounded-xl bg-red-950 p-2.5 text-sm text-red-300">
            {{ viewError }}
          </p>
        </div>

        <!-- ACTIONS -->
        <div v-if="!confirmingDelete" class="grid shrink-0 grid-cols-2 gap-3">
          <button
            class="rounded-xl border border-red-500/60 py-3 text-sm font-bold text-red-400 transition hover:bg-red-600 hover:text-white"
            @click="confirmingDelete = true"
          >
            Delete Document
          </button>
          <button
            class="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
            @click="closeDocument"
          >
            Close
          </button>
        </div>

        <!-- asks here, instead of the browser's "localhost says" popup -->
        <div v-else class="shrink-0 rounded-[16px] border border-red-500/40 bg-red-950/40 p-4">
          <p class="text-sm font-bold text-white">Delete this document?</p>
          <p class="mt-1 text-xs text-zinc-400">This cannot be undone.</p>

          <div class="mt-4 grid grid-cols-2 gap-3">
            <button
              class="rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
              :disabled="deleting"
              @click="deleteDocument(selectedDocument.id)"
            >
              {{ deleting ? 'Deleting...' : 'Yes, delete' }}
            </button>
            <button
              class="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition hover:bg-zinc-700 disabled:opacity-50"
              :disabled="deleting"
              @click="confirmingDelete = false"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import { uploadImage as uploadImage_ } from '../../lib/uploadImage'
import { GRID_PAGE_SIZES, usePagination } from '../../lib/usePagination'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'

const documents = ref([])
const loading = ref(true) // until the first load is done
const products = ref([])

// 16 or 24 documents a page (4 full rows of 4), or all of them. The choice
// is remembered on this device.
const gridTop = ref(null)
const {
  page,
  pageSize,
  visible: visibleDocuments,
} = usePagination(documents, {
  storageKey: 'staffDocumentation',
  scrollTarget: gridTop,
  sizes: GRID_PAGE_SIZES,
})

const showAddModal = ref(false)
const showProductDropdown = ref(false)

const uploading = ref(false)

const selectedFile = ref(null)

const modalError = ref('')

const selectedDocument = ref(null)

const updatePhotoFile = ref(null)
const updatingPhoto = ref(false)
const viewError = ref('')
const confirmingDelete = ref(false)
const deleting = ref(false)

const productSearch = ref('')

const currentUser = JSON.parse(
  localStorage.getItem('currentUser') || '{}'
)

const currentStaffName =
  currentUser.full_name ||
  currentUser.email ||
  'Staff'

const newDoc = ref({
  title: '',
  type: 'Staff Documentation',
  product_id: '',
  description: '',
})

onMounted(() => {
  fetchDocuments()
  fetchProducts()
})

const filteredProducts = computed(() => {
  return products.value.filter(product =>
    product.name
      ?.toLowerCase()
      .includes(productSearch.value.trim().toLowerCase())
  )
})

const selectedProductName = computed(() => {
  const product = products.value.find(
    p => p.id === newDoc.value.product_id
  )
  return product?.name || ''
})

async function fetchDocuments() {
  const { data } = await supabase.rpc('list_documentations_by_author', {
    p_created_by: currentStaffName,
  })

  documents.value = data || []
  loading.value = false
}

async function fetchProducts() {
  const { data } = await supabase.rpc('list_products', {
    p_filter: 'not_deleted',
    p_order_by: 'id_desc',
  })

  products.value = data || []
}

function handleFileChange(event) {
  selectedFile.value = event.target.files?.[0] || null
}

function selectProduct(product) {
  newDoc.value.product_id = product.id
  productSearch.value = product.name
  showProductDropdown.value = false
}

function closeAddModal() {
  showAddModal.value = false

  newDoc.value = {
    title: '',
    type: 'Staff Documentation',
    product_id: '',
    description: '',
  }

  selectedFile.value = null
  modalError.value = ''
}

async function uploadImage(file) {
  if (!file) return null

  return uploadImage_(file, { bucket: 'documents', folder: 'staff-documents' })
}

async function saveDocument() {
  if (uploading.value) return // a second click while saving made a duplicate
  modalError.value = ''

  if (!newDoc.value.title.trim()) {
    modalError.value = 'Please enter title.'
    return
  }

  uploading.value = true

  try {
    const imageUrl = await uploadImage(selectedFile.value)

    // Only a Product Report is about a product (the picker shows only for
    // it). A product picked before switching the type away used to stay
    // attached to the document.
    const forProduct = newDoc.value.type === 'Product Report'
    const selectedProduct = forProduct
      ? products.value.find(p => p.id === newDoc.value.product_id)
      : null

    const { error } = await supabase.rpc('create_documentation', {
      p_title: newDoc.value.title,
      p_type: newDoc.value.type,
      p_description: newDoc.value.description,
      p_product_id: forProduct ? newDoc.value.product_id || null : null,
      p_product_name: selectedProduct?.name || null,
      p_created_by: currentStaffName,
      p_image_url: imageUrl || null,
    })

    if (error) {
      modalError.value = error.message
      uploading.value = false
      return
    }

    await fetchDocuments()
    page.value = 1 // the new document is on the first page
    closeAddModal()
  } catch (err) {
    modalError.value = err.message
  }

  uploading.value = false
}

function openDocument(doc) {
  selectedDocument.value = doc
  confirmingDelete.value = false
  viewError.value = ''
  // a photo picked for another document must not be saved onto this one
  updatePhotoFile.value = null
}

function closeDocument() {
  selectedDocument.value = null
  updatePhotoFile.value = null
}

function handleUpdatePhoto(event) {
  updatePhotoFile.value = event.target.files?.[0] || null
}

async function updateDocumentPhoto() {
  if (updatingPhoto.value) return
  viewError.value = ''

  if (!selectedDocument.value) return

  if (!updatePhotoFile.value) {
    viewError.value = 'Please choose a photo first.'
    return
  }

  updatingPhoto.value = true

  try {
    const imageUrl = await uploadImage(updatePhotoFile.value)

    const { error } = await supabase.rpc('update_documentation_photo', {
      p_document_id: selectedDocument.value.id,
      p_image_url: imageUrl,
    })

    if (error) {
      viewError.value = error.message
      updatingPhoto.value = false
      return
    }

    selectedDocument.value.receipt_image_url = imageUrl
    selectedDocument.value.image_url = imageUrl

    await fetchDocuments()

    updatePhotoFile.value = null
  } catch (err) {
    viewError.value = err.message
  }

  updatingPhoto.value = false
}

// Only reached through "Yes, delete" in the document window.
async function deleteDocument(id) {
  viewError.value = ''
  deleting.value = true

  const { error } = await supabase.rpc('delete_documentation', {
    p_document_id: id,
  })

  deleting.value = false

  if (error) {
    viewError.value = error.message
    confirmingDelete.value = false
    return
  }

  selectedDocument.value = null
  confirmingDelete.value = false

  await fetchDocuments()
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>