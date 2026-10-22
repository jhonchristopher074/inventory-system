<template>
  <div>
    <PageHeader
      title="Archived Products"
      subtitle="Products that were moved to the archive."
    />

    <div class="mb-5 card p-5">
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

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <!-- ARCHIVED TABLE: 10 or 15 products a page -->
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
              <th class="text-right">Actions</th>
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
                ₱{{ Number(product.price || 0).toLocaleString() }}
              </td>

              <td data-label="Stock" class="num text-sm font-bold">
                <!-- one piece, so on phones "low" stays next to the number -->
                <span :class="Number(product.quantity || 0) <= 10 ? 'text-red-400' : 'text-white'">
                  {{ product.quantity }}
                  <span
                    v-if="Number(product.quantity || 0) <= 10"
                    class="ml-1 text-[0.6rem] uppercase tracking-wide"
                    >low</span
                  >
                </span>
              </td>

              <td data-label="Inspection" class="whitespace-nowrap text-xs text-zinc-400">
                {{ product.inspection_date ? formatDate(product.inspection_date) : 'None' }}
              </td>

              <td class="cell-actions">
                <div class="row-actions">
                  <button
                    class="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                    title="Move back to Inventory"
                    @click="openActionModal('restore', product)"
                  >
                    Restore
                  </button>

                  <button
                    class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-200 hover:bg-zinc-700"
                    title="Report a problem with this product"
                    @click="openReportModal(product)"
                  >
                    Report
                  </button>

                  <button
                    class="rounded-lg bg-red-600/15 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 hover:text-white"
                    title="Remove it from Inventory and Archived"
                    @click="openActionModal('delete', product)"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="filteredProducts.length === 0">
              <td colspan="6" class="cell-main p-6 text-center text-zinc-500">
                {{ loading ? 'Loading products...' : 'No archived products.' }}
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

    <!-- RESTORE / DELETE CONFIRM MODAL -->
    <div
      v-if="actionType"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeActionModal"
    >
      <div class="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-3 text-xl font-bold text-white">
          {{ actionType === 'restore' ? 'Restore Product' : 'Delete Product' }}
        </h2>

        <p class="mb-2 text-sm text-zinc-300">
          <b>Product:</b> {{ actionProduct?.name }}
        </p>

        <p v-if="actionType === 'restore'" class="mb-4 text-sm text-zinc-300">
          Move this item back to <b>Inventory</b>?
        </p>

        <p v-else class="mb-4 text-sm text-zinc-300">
          Are you sure you want to <b class="text-red-400">delete</b> this item?
          It will no longer appear in Inventory or Archived.
        </p>

        <p
          v-if="actionError"
          class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ actionError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
            :class="actionType === 'restore'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-red-600 hover:bg-red-700'"
            :disabled="actionSaving"
            @click="confirmAction"
          >
            {{ actionSaving ? 'Please wait...' : actionType === 'restore' ? 'Restore' : 'Delete' }}
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            :disabled="actionSaving"
            @click="closeActionModal"
          >
            Cancel
          </button>
        </div>
      </div>
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
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'

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

// ----- Restore / Delete buttons (asked to confirm first) -----
const actionProduct = ref(null)
const actionType = ref(null) // 'restore' | 'delete' | null
const actionError = ref('')
const actionSaving = ref(false)

onMounted(() => {
  fetchProducts()
})

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'archived',
    p_order_by: 'created_desc',
  })

  if (error) {
    errorMessage.value = error.message
    products.value = []
  } else {
    // Hide soft-deleted products. If the SQL isn't set up yet,
    // this returns nothing and all archived products still show.
    const { data: deletedRows } = await supabase.rpc('list_deleted_product_ids')
    const deletedIds = new Set((deletedRows || []).map(row => String(row.id)))

    products.value = (data || []).filter(
      product => !deletedIds.has(String(product.id))
    )
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

// The table shows 10 or 15 products a page, with page buttons under it.
const tableTop = ref(null)

const {
  page,
  pageSize,
  visible: visibleProducts,
  reset: resetList,
} = usePagination(filteredProducts, { storageKey: 'archived', scrollTarget: tableTop })

// a new search or category starts again at page 1
watch([search, selectedCategory], resetList)

// type: 'restore' | 'delete'
function openActionModal(type, product) {
  actionProduct.value = product
  actionError.value = ''
  actionType.value = type
}

function closeActionModal() {
  if (actionSaving.value) return

  actionType.value = null
  actionError.value = ''
  actionProduct.value = null
}

async function confirmAction() {
  if (!actionProduct.value || !actionType.value || actionSaving.value) return

  actionSaving.value = true
  actionError.value = ''

  const rpcName = actionType.value === 'restore' ? 'restore_product' : 'soft_delete_product'

  const { error } = await supabase.rpc(rpcName, {
    p_product_id: actionProduct.value.id,
  })

  actionSaving.value = false

  if (error) {
    actionError.value = error.message
    return
  }

  // Remove it from the list right away, then refresh from the database
  const movedId = actionProduct.value.id
  products.value = products.value.filter(product => product.id !== movedId)

  actionType.value = null
  actionProduct.value = null

  await fetchProducts()
}

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