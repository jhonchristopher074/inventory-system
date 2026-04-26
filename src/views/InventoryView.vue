<template>
  <div class="flex gap-5">
    <div class="flex-1">
      <PageHeader
        title="Inventory"
        subtitle="Manage and monitor all hardware products."
      />

      <!-- 🔍 SEARCH BAR -->
      <div class="mb-4">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search product or category..."
          class="w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
        />
      </div>

      <p v-if="loading" class="text-zinc-400">Loading products...</p>

      <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
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

      <div v-if="!loading && filteredProducts.length === 0" class="text-zinc-500">
        No products found.
      </div>

      <!-- GRID -->
      <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
        <div
          v-for="product in filteredProducts"
          :key="product.id"
          draggable="true"
          class="flex h-[330px] cursor-grab flex-col justify-between rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl transition hover:-translate-y-1 active:cursor-grabbing"
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

            <p class="text-sm text-zinc-400">{{ product.category }}</p>
            <p class="mt-2 text-sm text-zinc-300">Qty: {{ product.quantity }}</p>
          </div>
        </div>
      </div>

      <!-- PRODUCT MODAL -->
      <ProductModal
        :product="selectedProduct"
        @close="selectedProduct = null"
        @updated="fetchProducts"
      />
    </div>

    <!-- ARCHIVE BOX -->
    <aside class="sticky top-5 h-fit w-[280px] shrink-0">
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

    <!-- CONFIRM MODAL -->
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

        <p v-if="modalError" class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400">
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
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import ProductModal from '../components/ProductModal.vue'
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader.vue'

const products = ref([])
const selectedCategory = ref('All')
const selectedProduct = ref(null)
const draggedProduct = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const isDragOver = ref(false)
const searchQuery = ref('')

const actionModal = ref(false)
const modalError = ref('')

const categories = computed(() => [
  'All',
  ...new Set(products.value.map((product) => product.category)),
])

const filteredProducts = computed(() => {
  let result = products.value

  if (selectedCategory.value !== 'All') {
    result = result.filter((product) => product.category === selectedCategory.value)
  }

  if (searchQuery.value.trim()) {
    const search = searchQuery.value.toLowerCase()

    result = result.filter((product) =>
      product.name.toLowerCase().includes(search) ||
      product.category.toLowerCase().includes(search)
    )
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
    .order('id', { ascending: true })

  if (error) {
    errorMessage.value = error.message
  } else {
    products.value = data || []
  }

  loading.value = false
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
    .update({ is_archived: true })
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
  })

  actionModal.value = false
  draggedProduct.value = null
  await fetchProducts()
}

function openModal(product) {
  selectedProduct.value = product
}

onMounted(fetchProducts)
</script>