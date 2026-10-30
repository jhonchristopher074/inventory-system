<template>
  <div>
    <PageHeader
      title="Staff Inventory"
      subtitle="View products and report inventory concerns."
    />

    <div class="mb-5 card p-5">
      <div class="grid gap-4 md:grid-cols-[1fr_220px_auto]">
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

        <!-- only the products running low, emptiest first (?stock=low) -->
        <button
          type="button"
          class="flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition"
          :class="lowOnly
            ? 'border-yellow-400 bg-yellow-400 text-black'
            : 'border-yellow-500/40 bg-zinc-900 text-yellow-400 hover:bg-yellow-500/10'"
          :aria-pressed="lowOnly"
          :title="`Products with ${LOW_STOCK} or fewer left, emptiest first`"
          @click="stockFilter = lowOnly ? 'all' : 'low'"
        >
          <NavIcon name="alert" class="h-4 w-4" />
          Low stock
          <span class="rounded-full px-1.5 text-xs" :class="lowOnly ? 'bg-black/15' : 'bg-yellow-500/15'">
            {{ count(lowCount) }}
          </span>
        </button>
      </div>
    </div>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <!-- PRODUCT TABLE: 10, 15 or all products a page -->
    <div ref="tableTop" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table resp-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th class="num">Price</th>
              <th class="num">Stock</th>
              <th>Inspection</th>
              <th class="text-right">Action</th>
            </tr>
          </thead>

          <tbody>
            <tr v-for="product in visibleProducts" :key="product.id">
              <td class="cell-main">
                <div class="flex min-w-0 items-center gap-3">
                  <img
                    v-if="product.image_url"
                    :src="product.image_url"
                    :alt="product.name"
                    class="list-thumb"
                    loading="lazy"
                  />
                  <span
                    v-else
                    class="list-thumb grid place-items-center text-[0.6rem] text-zinc-500"
                  >
                    No Image
                  </span>

                  <p class="min-w-0 font-bold text-white">{{ product.name }}</p>
                </div>
              </td>

              <td data-label="Category" class="text-sm text-zinc-400">
                {{ product.category || 'Uncategorized' }}
              </td>

              <td data-label="Price" class="num text-sm font-bold text-white">
                {{ peso(product.price || 0) }}
              </td>

              <td data-label="Stock" class="num text-sm font-bold">
                <StockLevel :product="product" />
              </td>

              <td data-label="Inspection" class="whitespace-nowrap text-xs text-zinc-400">
                {{ product.inspection_date ? formatDate(product.inspection_date) : 'None' }}
              </td>

              <td class="cell-actions">
                <div class="row-actions">
                  <button
                    class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    @click="openReportModal(product)"
                  >
                    Report
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredProducts.length === 0">
              <td colspan="6" class="cell-main p-6 text-center text-zinc-500">
                {{
                  loading
                    ? 'Loading products...'
                    : lowOnly
                      ? `No product here is running low (${LOW_STOCK} or fewer left).`
                      : 'No products found.'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-if="filteredProducts.length > 0"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredProducts.length"
        noun="products"
      />
    </div>

    <!-- REPORT MODAL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeReportModal"
    >
      <div class="max-h-[92vh] w-full max-w-md overflow-y-auto card p-5">
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
            class="flex-1 rounded-2xl bg-red-600 py-3 font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="reportSaving"
            @click="submitReport"
          >
            {{ reportSaving ? 'Sending...' : 'Submit Report' }}
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
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { usePagination } from '../../lib/usePagination'
import { useQueryParam } from '../../lib/useQueryParam'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'
import NavIcon from '../../components/NavIcon.vue'
import StockLevel from '../../components/StockLevel.vue'
import { count, peso } from '../../lib/format'
import { LOW_STOCK, byStockLevel, isLowStock } from '../../lib/stock'

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
const reportSaving = ref(false)

onMounted(() => {
  fetchProducts()
})

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'active',
    p_order_by: 'created_desc',
  })

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

// "Low stock" button: ?stock=low in the address
const stockFilter = useQueryParam('stock', 'all', ['all', 'low'])
const lowOnly = computed(() => stockFilter.value === 'low')

// the search and the category
const shownProducts = computed(() => {
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

// the number on the Low stock button: of the products shown
const lowCount = computed(() => shownProducts.value.filter(isLowStock).length)

// what the table lists: with Low stock on, only those, emptiest first
const filteredProducts = computed(() =>
  lowOnly.value ? shownProducts.value.filter(isLowStock).sort(byStockLevel) : shownProducts.value
)

// The table shows 10, 15 or all products a page, with page buttons under it.
const tableTop = ref(null)

const {
  page,
  pageSize,
  visible: visibleProducts,
  reset: resetList,
} = usePagination(filteredProducts, { storageKey: 'staffInventory', scrollTarget: tableTop })

// a new search, category or stock filter starts again at page 1
watch([search, selectedCategory, stockFilter], resetList)

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
  if (reportSaving.value) return // a double click used to send the report twice

  modalError.value = ''
  modalSuccess.value = ''

  if (!selectedProduct.value) return

  if (!reportDescription.value.trim()) {
    modalError.value = 'Please enter report description.'
    return
  }

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')

  reportSaving.value = true

  const { error } = await supabase.rpc('submit_product_report', {
    p_product_id: selectedProduct.value.id,
    p_product_name: selectedProduct.value.name,
    p_report_type: reportType.value,
    p_description: reportDescription.value.trim(),
    p_reported_by: currentUser.full_name || currentUser.email || 'Staff',
    p_image_url: selectedProduct.value.image_url || null,
  })

  reportSaving.value = false

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