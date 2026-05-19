<template>
  <div class="flex items-start gap-5">
    <div class="flex-1">
      <PageHeader title="Inventory" subtitle="Manage and monitor all hardware products." />

      <!-- TOP ACTIONS -->
      <div class="mb-4 flex gap-3">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search product or category..."
          class="flex-1 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
        />

        <button
          class="rounded-2xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700"
          @click="showAddModal = true"
        >
          + Add Product
        </button>
      </div>

      <p v-if="loading" class="text-zinc-400">Loading products...</p>

      <p
        v-if="errorMessage"
        class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
      >
        {{ errorMessage }}
      </p>

      <!-- CATEGORY FILTER -->
      <div class="mb-5 flex gap-3 overflow-x-auto pb-2">
        <button
          v-for="category in categories"
          :key="category"
          class="rounded-full border px-4 py-2 text-sm font-bold transition"
          :class="
            selectedCategory === category
              ? 'border-red-600 bg-red-600 text-white'
              : 'border-white/10 bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
          "
          @click="selectedCategory = category"
        >
          {{ category }}
        </button>
      </div>

      <div
        v-if="!loading && filteredProducts.length === 0"
        class="text-zinc-500"
      >
        No products found.
      </div>

      <!-- PRODUCT GRID -->
      <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          draggable="true"
          class="flex h-[380px] cursor-grab flex-col justify-between rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl transition hover:-translate-y-1 active:cursor-grabbing"
          @dragstart="startDrag(product)"
          @click="openModal(product)"
        >
          <img
            :src="product.image_url || 'https://via.placeholder.com/300x200'"
            :alt="product.name"
            class="mb-3 h-[150px] w-full rounded-2xl object-cover"
          />

          <div class="flex-1">
            <h3 class="mb-2 min-h-[56px] text-xl font-bold leading-tight text-white">
              {{ product.name }}
            </h3>

            <p class="text-sm text-zinc-400">
              {{ product.category || 'Uncategorized' }}
            </p>

            <p class="mt-2 text-sm text-zinc-300">
              Qty: {{ product.quantity }}
            </p>

            <p class="mt-1 text-sm font-bold text-red-400">
              ₱{{ Number(product.price || 0).toFixed(2) }}
            </p>
          </div>

          <button
            class="mt-3 w-full rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700"
            @click.stop="openStockModal(product)"
          >
            Add Stock
          </button>
        </div>
      </div>
    </div>

    <!-- ARCHIVE BOX -->
    <aside class="archive-box w-[280px]">
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="text-2xl font-bold text-white">Archive Box</h2>
        <p class="mb-4 text-sm text-zinc-400">Sticky drag area</p>

        <div
          class="flex min-h-[175px] items-center justify-center rounded-[20px] border-2 border-dashed border-red-500 bg-red-500/10 p-4 text-center transition"
          :class="isDragOver ? 'scale-[1.02] bg-red-500/20' : ''"
          @dragover.prevent="isDragOver = true"
          @dragleave="isDragOver = false"
          @drop="openArchiveModal"
        >
          <div>
            <strong class="mb-1 block text-xl text-white">Drag & Drop</strong>
            <span class="text-sm text-red-200">Archive product here</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- PRODUCT DETAILS MODAL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="selectedProduct = null"
    >
      <div
        class="relative w-full max-w-[520px] rounded-[28px] border border-white/10 bg-zinc-900 p-6 shadow-2xl"
      >
        <button
          class="absolute right-5 top-5 rounded-full bg-black px-4 py-2 text-xl text-white hover:bg-red-600"
          @click="selectedProduct = null"
        >
          ×
        </button>

        <div class="flex flex-col items-center text-center">
          <img
            :src="selectedProduct.image_url || 'https://via.placeholder.com/600x400'"
            class="mb-5 h-[260px] w-full cursor-zoom-in rounded-3xl object-cover shadow-lg"
            @click="previewImage = selectedProduct.image_url || 'https://via.placeholder.com/600x400'"
          />

          <h2 class="text-3xl font-extrabold text-white">
            {{ selectedProduct.name }}
          </h2>

          <p class="mt-3 text-zinc-300">
            <b>Category:</b> {{ selectedProduct.category || 'Uncategorized' }}
          </p>

          <p class="mt-2 text-zinc-300">
            <b>Quantity:</b> {{ selectedProduct.quantity }}
          </p>

          <p class="mt-2 text-red-400">
            <b>Price:</b> ₱{{ Number(selectedProduct.price || 0).toFixed(2) }}
          </p>

          <div class="mt-6 w-full text-left">
            <label class="label">Inspection Date</label>

            <input
              v-model="inspectionDate"
              type="date"
              class="w-full rounded-2xl border border-white/10 bg-zinc-800 px-4 py-4 text-lg text-white outline-none"
            />
          </div>

          <div class="mt-5 flex w-full gap-3">
            <button
              class="flex-1 rounded-2xl bg-red-600 py-4 text-lg font-bold text-white transition hover:bg-red-700"
              @click="setInspectionDate"
            >
              Set Inspection Date
            </button>

            <button
              class="flex-1 rounded-2xl bg-zinc-800 py-4 text-lg font-bold text-white transition hover:bg-zinc-700"
              @click="reportProduct"
            >
              Report Product
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- FULL IMAGE PREVIEW -->
    <div
      v-if="previewImage"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/95 p-4"
      @click.self="previewImage = null"
    >
      <button
        class="absolute right-6 top-6 rounded-full bg-zinc-900 px-4 py-2 text-2xl text-white hover:bg-red-600"
        @click="previewImage = null"
      >
        ×
      </button>

      <img
        :src="previewImage"
        class="max-h-[92vh] max-w-[96vw] rounded-3xl object-contain shadow-2xl"
      />
    </div>

    <!-- ARCHIVE CONFIRM MODAL -->
    <div
      v-if="actionModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeActionModal"
    >
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-3 text-xl font-bold text-white">Move Product</h2>

        <p class="mb-2 text-sm text-zinc-300">
          <b>Product:</b> {{ draggedProduct?.name }}
        </p>

        <p class="mb-4 text-sm text-zinc-300">
          Are you sure you want to move this item to <b>Archived</b>?
        </p>

        <p
          v-if="modalError"
          class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ modalError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
            @click="confirmArchive"
          >
            Proceed
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            @click="closeActionModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- ADD PRODUCT MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeAddModal"
    >
      <div class="w-full max-w-4xl rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-extrabold text-white">Add Product</h2>
            <p class="text-sm text-zinc-400">Create a new inventory item.</p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            ✕
          </button>
        </div>

        <div class="grid gap-6 md:grid-cols-[1fr_360px]">
          <div class="space-y-4 rounded-3xl bg-black/40 p-5">
            <h3 class="text-lg font-bold text-white">Product Details</h3>

            <div>
              <label class="label">Product Name</label>
              <input
                v-model="newProduct.name"
                type="text"
                placeholder="e.g. Vinyl Electrical Tape"
                class="input"
              />
            </div>

            <div>
              <label class="label">Category</label>
              <input
                v-model="newProduct.category"
                type="text"
                placeholder="e.g. Electrical Tape"
                class="input"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="label">Quantity</label>
                <input
                  v-model.number="newProduct.quantity"
                  type="number"
                  min="0"
                  placeholder="Enter quantity"
                  class="input"
                />
              </div>

              <div>
                <label class="label">Price</label>
                <input
                  v-model.number="newProduct.price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter price"
                  class="input"
                />
              </div>
            </div>
          </div>

          <div class="space-y-4 rounded-3xl bg-black/40 p-5">
            <h3 class="text-lg font-bold text-white">Product Image</h3>

            <label class="flex h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-red-500/70 bg-red-500/10 text-center hover:bg-red-500/20">
              <span class="text-3xl">📷</span>
              <span class="mt-2 font-bold text-white">
                {{ uploading ? 'Uploading...' : 'Upload Image' }}
              </span>
              <span class="text-xs text-zinc-400">PNG, JPG, JPEG</span>

              <input
                type="file"
                accept="image/*"
                @change="handleImageUpload"
                class="hidden"
              />
            </label>

            <div class="text-center text-xs uppercase tracking-widest text-zinc-500">
              OR paste image URL
            </div>

            <input
              v-model="newProduct.image_url"
              type="text"
              placeholder="https://image-link..."
              class="input"
            />

            <div class="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
              <img
                v-if="newProduct.image_url"
                :src="newProduct.image_url"
                class="h-44 w-full object-cover"
              />

              <div
                v-else
                class="flex h-44 items-center justify-center text-sm text-zinc-500"
              >
                Image preview will appear here
              </div>
            </div>
          </div>
        </div>

        <p
          v-if="addError"
          class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
        >
          {{ addError }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <button
            class="rounded-2xl bg-zinc-800 px-8 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            Cancel
          </button>

          <button
            class="rounded-2xl bg-red-600 px-10 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="uploading"
            @click="addProduct"
          >
            Add Product
          </button>
        </div>
      </div>
    </div>

    <!-- ADD STOCK MODAL -->
    <div
      v-if="showStockModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeStockModal"
    >
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-2 text-2xl font-bold text-white">Add Stock</h2>

        <p class="mb-1 text-sm text-zinc-400">Product</p>
        <p class="mb-4 font-bold text-white">{{ stockProduct?.name }}</p>

        <p class="mb-2 text-sm text-zinc-400">
          Current Quantity: {{ stockProduct?.quantity }}
        </p>

        <input
          v-model.number="stockAmount"
          type="number"
          min="1"
          placeholder="Enter quantity to add"
          class="input"
        />

        <p
          v-if="stockError"
          class="mt-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ stockError }}
        </p>

        <div class="mt-5 flex gap-3">
          <button
            class="flex-1 rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
            @click="addStock"
          >
            Confirm
          </button>

          <button
            class="flex-1 rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeStockModal"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import { supabase } from '../../lib/supabase'

const products = ref([])
const selectedCategory = ref('All')
const selectedProduct = ref(null)
const draggedProduct = ref(null)
const previewImage = ref(null)
const inspectionDate = ref('')

const loading = ref(false)
const errorMessage = ref('')
const isDragOver = ref(false)
const searchQuery = ref('')

const actionModal = ref(false)
const modalError = ref('')

const showAddModal = ref(false)
const showStockModal = ref(false)

const addError = ref('')
const stockError = ref('')

const stockProduct = ref(null)
const stockAmount = ref(0)

const uploading = ref(false)

const newProduct = ref({
  name: '',
  category: '',
  quantity: '',
  price: '',
  image_url: '',
})

const categories = computed(() => {
  const uniqueCategories = products.value
    .map(product => product.category || 'Uncategorized')
    .filter(Boolean)

  return ['All', ...new Set(uniqueCategories)]
})

const filteredProducts = computed(() => {
  let result = products.value

  if (selectedCategory.value !== 'All') {
    result = result.filter(
      product => (product.category || 'Uncategorized') === selectedCategory.value
    )
  }

  if (searchQuery.value.trim()) {
    const search = searchQuery.value.toLowerCase()

    result = result.filter(product => {
      const name = product.name || ''
      const category = product.category || 'Uncategorized'

      return (
        name.toLowerCase().includes(search) ||
        category.toLowerCase().includes(search)
      )
    })
  }

  return result
})

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('id', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    products.value = data || []
  }

  loading.value = false
}

function openModal(product) {
  selectedProduct.value = product
  inspectionDate.value = product.inspection_date || ''
}

function startDrag(product) {
  draggedProduct.value = product
}

function openArchiveModal() {
  isDragOver.value = false

  if (!draggedProduct.value) return

  modalError.value = ''
  actionModal.value = true
}

function closeActionModal() {
  actionModal.value = false
  modalError.value = ''
}

async function confirmArchive() {
  if (!draggedProduct.value) return

  const { error } = await supabase
    .from('products')
    .update({
      is_archived: true,
      is_deleted: false,
    })
    .eq('id', draggedProduct.value.id)

  if (error) {
    modalError.value = error.message
    return
  }

  await supabase.from('notifications').insert({
    title: 'Product Archived',
    message: `${draggedProduct.value.name} was moved to Archived.`,
    type: 'archive',
    product_id: draggedProduct.value.id,
    is_read: false,
  })

  actionModal.value = false
  draggedProduct.value = null

  await fetchProducts()
}

function openStockModal(product) {
  stockProduct.value = product
  stockAmount.value = 0
  stockError.value = ''
  showStockModal.value = true
}

function closeStockModal() {
  showStockModal.value = false
  stockProduct.value = null
  stockAmount.value = 0
  stockError.value = ''
}

async function addStock() {
  if (!stockProduct.value) return

  if (!stockAmount.value || Number(stockAmount.value) <= 0) {
    stockError.value = 'Please enter a valid quantity.'
    return
  }

  const newQty =
    Number(stockProduct.value.quantity || 0) +
    Number(stockAmount.value)

  const { error } = await supabase
    .from('products')
    .update({
      quantity: newQty,
    })
    .eq('id', stockProduct.value.id)

  if (error) {
    stockError.value = error.message
    return
  }

  await supabase.from('notifications').insert({
    title: 'Stock Added',
    message: `${stockAmount.value} stock added to ${stockProduct.value.name}.`,
    type: 'restore',
    product_id: stockProduct.value.id,
    is_read: false,
  })

  closeStockModal()
  await fetchProducts()
}

function closeAddModal() {
  showAddModal.value = false
  addError.value = ''
}

async function addProduct() {
  addError.value = ''

  if (!newProduct.value.name.trim()) {
    addError.value = 'Product name is required.'
    return
  }

  const { error } = await supabase
    .from('products')
    .insert({
      name: newProduct.value.name.trim(),
      category: newProduct.value.category.trim() || 'Uncategorized',
      quantity: Number(newProduct.value.quantity || 0),
      price: Number(newProduct.value.price || 0),
      image_url: newProduct.value.image_url.trim() || null,
      is_archived: false,
      is_deleted: false,
      approved_count: 0,
      return_count: 0,
    })

  if (error) {
    addError.value = error.message
    return
  }

  await supabase.from('notifications').insert({
    title: 'Product Added',
    message: `${newProduct.value.name} was added to inventory.`,
    type: 'restore',
    is_read: false,
  })

  newProduct.value = {
    name: '',
    category: '',
    quantity: '',
    price: '',
    image_url: '',
  }

  showAddModal.value = false

  await fetchProducts()
}

async function handleImageUpload(event) {
  const file = event.target.files[0]

  if (!file) return

  uploading.value = true

  const fileName = `${Date.now()}-${file.name}`

  const { error } = await supabase.storage
    .from('products')
    .upload(fileName, file)

  if (error) {
    alert(error.message)
    uploading.value = false
    return
  }

  const {
    data: { publicUrl },
  } = supabase.storage
    .from('products')
    .getPublicUrl(fileName)

  newProduct.value.image_url = publicUrl
  uploading.value = false
}

async function setInspectionDate() {
  if (!selectedProduct.value || !inspectionDate.value) return

  const { error } = await supabase
    .from('products')
    .update({
      inspection_date: inspectionDate.value,
    })
    .eq('id', selectedProduct.value.id)

  if (error) {
    alert(error.message)
    return
  }

  await supabase.from('notifications').insert({
    title: 'Inspection Date Set',
    message: `${selectedProduct.value.name} inspection date was set.`,
    type: 'inspection',
    product_id: selectedProduct.value.id,
    is_read: false,
  })

  selectedProduct.value = null

  await fetchProducts()
}

async function reportProduct() {
  if (!selectedProduct.value) return

  await supabase.from('notifications').insert({
    title: 'Product Reported',
    message: `${selectedProduct.value.name} was reported for checking.`,
    type: 'return',
    product_id: selectedProduct.value.id,
    is_read: false,
  })

  alert('Product report sent.')
}

onMounted(fetchProducts)
</script>

<style scoped>
.label {
  margin-bottom: 0.5rem;
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
}

.input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
}

.input:focus {
  border-color: rgb(239 68 68);
}
</style>