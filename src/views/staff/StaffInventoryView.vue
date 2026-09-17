<template>
  <div>
    <PageHeader
      title="Staff Inventory"
      subtitle="View products and report inventory concerns."
    />

    <div class="mb-5 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <div class="grid gap-4 md:grid-cols-[1fr_220px]">
        <input
          v-model="search"
          type="text"
          placeholder="Search product..."
          class="input"
        />

        <select v-model="selectedCategory" class="input">
          <option value="All">All Categories</option>
          <option
            v-for="category in categories"
            :key="category"
            :value="category"
          >
            {{ category }}
          </option>
        </select>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-zinc-400">Loading products...</p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <div
      v-if="!loading && filteredProducts.length === 0"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No products found.
    </div>

    <div class="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <div
        v-for="product in filteredProducts"
        :key="product.id"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-4 shadow-xl"
      >
        <div
          class="mb-4 flex h-40 items-center justify-center overflow-hidden rounded-2xl bg-black"
        >
          <img
            v-if="product.image_url"
            :src="product.image_url"
            class="h-full w-full object-cover"
          />

          <span v-else class="text-sm text-zinc-500">
            No Image
          </span>
        </div>

        <h2 class="text-xl font-bold text-white">
          {{ product.name }}
        </h2>

        <p class="mt-1 text-sm text-red-400">
          {{ product.category || 'Uncategorized' }}
        </p>

        <div class="mt-4 space-y-2 text-sm text-zinc-300">
          <p>
            Quantity:
            <span
              class="font-bold"
              :class="Number(product.quantity || 0) <= 5 ? 'text-red-400' : 'text-white'"
            >
              {{ product.quantity }}
            </span>
          </p>

          <p>
            Price:
            <span class="font-bold text-white">
              ₱{{ Number(product.price || 0).toLocaleString() }}
            </span>
          </p>

          <p>
            Inspection Date:
            <span class="font-bold text-white">
              {{ product.inspection_date ? formatDate(product.inspection_date) : 'None' }}
            </span>
          </p>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <span
            v-if="Number(product.quantity || 0) <= 5"
            class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400"
          >
            Low Stock
          </span>

          <span
            v-else
            class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400"
          >
            In Stock
          </span>
        </div>

        <button
          class="mt-5 w-full rounded-2xl bg-red-600 py-3 font-bold text-white transition hover:bg-red-700"
          @click="openReportModal(product)"
        >
          Report Product
        </button>
      </div>
    </div>

    <!-- REPORT MODAL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeReportModal"
    >
      <div class="w-full max-w-md rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <h2 class="text-2xl font-bold text-white">
          Report Product
        </h2>

        <p class="mt-2 text-sm text-zinc-400">
          Product: {{ selectedProduct.name }}
        </p>

        <div class="mt-5 space-y-4">
          <div>
            <label class="label">Report Type</label>
            <select v-model="reportType" class="input">
              <option value="Low Stock">Low Stock</option>
              <option value="Damaged Item">Damaged Item</option>
              <option value="Wrong Quantity">Wrong Quantity</option>
              <option value="Missing Item">Missing Item</option>
              <option value="Other Concern">Other Concern</option>
            </select>
          </div>

          <div>
            <label class="label">Description</label>
            <textarea
              v-model="reportDescription"
              rows="4"
              placeholder="Explain the issue..."
              class="input resize-none"
            ></textarea>
          </div>
        </div>

        <p
          v-if="modalError"
          class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400"
        >
          {{ modalError }}
        </p>

        <p
          v-if="modalSuccess"
          class="mt-4 rounded-xl bg-emerald-600/20 p-3 text-sm text-emerald-400"
        >
          {{ modalSuccess }}
        </p>

        <div class="mt-5 flex gap-3">
          <button
            class="flex-1 rounded-2xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
            @click="submitReport"
          >
            Submit Report
          </button>

          <button
            class="flex-1 rounded-2xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
            @click="closeReportModal"
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
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const products = ref([])
const loading = ref(false)
const errorMessage = ref('')

const search = ref('')
const selectedCategory = ref('All')

const selectedProduct = ref(null)
const reportType = ref('Low Stock')
const reportDescription = ref('')
const modalError = ref('')
const modalSuccess = ref('')

onMounted(() => {
  fetchProducts()
})

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    products.value = data || []
  }

  loading.value = false
}

const categories = computed(() => {
  const unique = new Set()

  products.value.forEach(product => {
    if (product.category) {
      unique.add(product.category)
    }
  })

  return [...unique]
})

const filteredProducts = computed(() => {
  const keyword = search.value.toLowerCase().trim()

  return products.value.filter(product => {
    const matchesSearch =
      product.name?.toLowerCase().includes(keyword) ||
      product.category?.toLowerCase().includes(keyword)

    const matchesCategory =
      selectedCategory.value === 'All' ||
      product.category === selectedCategory.value

    return matchesSearch && matchesCategory
  })
})

function openReportModal(product) {
  selectedProduct.value = product
  reportType.value = 'Low Stock'
  reportDescription.value = ''
  modalError.value = ''
  modalSuccess.value = ''
}

function closeReportModal() {
  selectedProduct.value = null
  reportType.value = 'Low Stock'
  reportDescription.value = ''
  modalError.value = ''
  modalSuccess.value = ''
}

async function submitReport() {
  modalError.value = ''
  modalSuccess.value = ''

  if (!selectedProduct.value) return

  if (!reportDescription.value.trim()) {
    modalError.value = 'Please enter report description.'
    return
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')

  const { error } = await supabase.rpc('submit_product_report', {
    p_product_id: selectedProduct.value.id,
    p_product_name: selectedProduct.value.name,
    p_report_type: reportType.value,
    p_description: reportDescription.value.trim(),
    p_reported_by: currentUser.full_name || currentUser.email || 'Staff',
    p_image_url: selectedProduct.value.image_url || null,
  })

  if (error) {
    modalError.value = error.message
    return
  }

  modalSuccess.value = 'Product report submitted successfully.'
  reportDescription.value = ''
}

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
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

.label {
  margin-bottom: 0.5rem;
  display: block;
  font-size: 0.875rem;
  font-weight: 700;
  color: rgb(212 212 216);
}
</style>