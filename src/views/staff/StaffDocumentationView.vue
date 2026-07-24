<template>
  <div class="min-h-screen text-white">
    <PageHeader
      title="Employee Documentation"
      subtitle="Create and view your own documentation records."
    />

    <!-- DOCUMENT GRID -->
    <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div
        v-for="doc in documents"
        :key="doc.id"
        class="rounded-[18px] border border-white/10 bg-zinc-900 p-4 transition hover:border-red-500/40"
      >
        <!-- IMAGE -->
        <div
          class="mb-3 flex h-28 items-center justify-center overflow-hidden rounded-xl bg-black"
        >
          <img
            v-if="doc.receipt_image_url || doc.image_url"
            :src="doc.receipt_image_url || doc.image_url"
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
        <div class="inline-flex rounded-full bg-red-950 px-3 py-1 text-[11px] font-bold text-red-400">
          {{ doc.type || 'Staff Documentation' }}
        </div>

        <!-- TITLE -->
        <h2 class="mt-2 text-base font-bold text-white leading-snug">
          {{ doc.title || 'Untitled Document' }}
        </h2>

        <!-- PRODUCT -->
        <p v-if="doc.product_name" class="mt-1 text-xs font-semibold text-yellow-400 line-clamp-1">
          {{ doc.product_name }}
        </p>

        <!-- DESCRIPTION -->
        <p class="mt-1 line-clamp-2 text-xs text-zinc-500">
          {{ doc.description || 'No description.' }}
        </p>

        <!-- DATE -->
        <p class="mt-2 text-[11px] text-zinc-600">
          {{ formatDate(doc.created_at) }}
        </p>

        <!-- OPEN -->
        <button
          class="mt-3 w-full rounded-xl bg-red-600 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          @click="openDocument(doc)"
        >
          Open
        </button>
      </div>
    </div>

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
      <div class="w-full max-w-lg rounded-[24px] border border-white/10 bg-zinc-900 p-5">
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
              class="rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700"
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
    <div
      v-if="selectedDocument"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div class="w-full max-w-xl rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <!-- HEADER -->
        <div class="mb-4 flex items-start justify-between">
          <div>
            <h2 class="text-2xl font-black text-white">{{ selectedDocument.title }}</h2>
            <p class="mt-1 text-xs text-zinc-500">{{ formatDate(selectedDocument.created_at) }}</p>
          </div>
          <button
            class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xl text-white transition hover:bg-white/20"
            @click="selectedDocument = null"
          >
            ×
          </button>
        </div>

        <!-- IMAGE -->
        <div class="mb-4 overflow-hidden rounded-[16px] border border-white/10 bg-black">
          <img
            v-if="selectedDocument.receipt_image_url || selectedDocument.image_url"
            :src="selectedDocument.receipt_image_url || selectedDocument.image_url"
            class="max-h-56 w-full object-contain"
          />
          <div
            v-else
            class="flex h-28 flex-col items-center justify-center gap-1 text-zinc-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="text-[11px] uppercase tracking-wide">No image attached</span>
          </div>
        </div>

        <!-- CONTENT -->
        <div class="rounded-[16px] bg-black p-4 mb-4">
          <div class="mb-3 inline-flex rounded-full bg-red-950 px-3 py-1 text-[11px] font-bold text-red-400">
            {{ selectedDocument.type }}
          </div>
          <div v-if="selectedDocument.product_name" class="mb-2 text-sm font-bold text-yellow-400">
            {{ selectedDocument.product_name }}
          </div>
          <p class="whitespace-pre-line text-sm text-white">{{ selectedDocument.description }}</p>
        </div>

        <!-- UPDATE PHOTO -->
        <div class="rounded-[16px] bg-black p-4 mb-4">
          <h3 class="mb-3 text-sm font-bold text-white">Add / Change Photo</h3>
          <input
            type="file"
            accept="image/*"
            class="w-full rounded-xl border border-white/10 bg-zinc-800 p-3 text-sm text-white mb-3"
            @change="handleUpdatePhoto"
          />
          <button
            class="w-full rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
            @click="updateDocumentPhoto"
          >
            {{ updatingPhoto ? 'Uploading...' : 'Save Photo' }}
          </button>
          <p v-if="viewError" class="mt-2 rounded-xl bg-red-950 p-3 text-sm text-red-300">
            {{ viewError }}
          </p>
        </div>

        <!-- ACTIONS -->
        <div class="grid grid-cols-2 gap-3">
          <button
            class="rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition hover:bg-red-700"
            @click="deleteDocument(selectedDocument.id)"
          >
            Delete
          </button>
          <button
            class="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition hover:bg-zinc-700"
            @click="selectedDocument = null"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const documents = ref([])
const products = ref([])

const showAddModal = ref(false)
const showProductDropdown = ref(false)

const uploading = ref(false)

const selectedFile = ref(null)

const modalError = ref('')

const selectedDocument = ref(null)

const updatePhotoFile = ref(null)
const updatingPhoto = ref(false)
const viewError = ref('')

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
      .includes(productSearch.value.toLowerCase())
  )
})

const selectedProductName = computed(() => {
  const product = products.value.find(
    p => p.id === newDoc.value.product_id
  )
  return product?.name || ''
})

async function fetchDocuments() {
  const { data } = await supabase
    .from('documentations')
    .select('*')
    .eq('created_by', currentStaffName)
    .order('created_at', { ascending: false })

  documents.value = data || []
}

async function fetchProducts() {
  const { data } = await supabase
    .from('products')
    .select('id,name,category')
    .eq('is_deleted', false)

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

  const fileExt = file.name.split('.').pop()

  const fileName = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${fileExt}`

  const filePath = `staff-documents/${fileName}`

  const { error } = await supabase.storage
    .from('documents')
    .upload(filePath, file)

  if (error) throw error

  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath)

  return data.publicUrl
}

async function saveDocument() {
  modalError.value = ''

  if (!newDoc.value.title.trim()) {
    modalError.value = 'Please enter title.'
    return
  }

  uploading.value = true

  try {
    const imageUrl = await uploadImage(selectedFile.value)

    const selectedProduct = products.value.find(
      p => p.id === newDoc.value.product_id
    )

    const { error } = await supabase
      .from('documentations')
      .insert({
        title: newDoc.value.title,
        type: newDoc.value.type,
        description: newDoc.value.description,
        product_id: newDoc.value.product_id || null,
        product_name: selectedProduct?.name || null,
        created_by: currentStaffName,
        receipt_image_url: imageUrl || null,
        image_url: imageUrl || null,
      })

    if (error) {
      modalError.value = error.message
      uploading.value = false
      return
    }

    await fetchDocuments()
    closeAddModal()
  } catch (err) {
    modalError.value = err.message
  }

  uploading.value = false
}

function openDocument(doc) {
  selectedDocument.value = doc
}

function handleUpdatePhoto(event) {
  updatePhotoFile.value = event.target.files?.[0] || null
}

async function updateDocumentPhoto() {
  viewError.value = ''

  if (!selectedDocument.value) return

  if (!updatePhotoFile.value) {
    viewError.value = 'Please choose a photo first.'
    return
  }

  updatingPhoto.value = true

  try {
    const imageUrl = await uploadImage(updatePhotoFile.value)

    const { error } = await supabase
      .from('documentations')
      .update({
        receipt_image_url: imageUrl,
        image_url: imageUrl,
      })
      .eq('id', selectedDocument.value.id)

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

async function deleteDocument(id) {
  await supabase
    .from('documentations')
    .delete()
    .eq('id', id)

  selectedDocument.value = null

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