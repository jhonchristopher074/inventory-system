<template>
  <div class="flex flex-col items-start gap-5 md:flex-row">
    <div class="w-full min-w-0 flex-1">
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

      <p v-if="loading" class="text-sm text-zinc-400">Loading products...</p>

      <p
        v-if="errorMessage"
        class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
      >
        {{ errorMessage }}
      </p>

      <div
        v-if="!loading && filteredProducts.length === 0"
        class="mb-4 card p-5 text-zinc-400"
      >
        No archived products.
      </div>

      <div class="card overflow-hidden">
        <div class="list-head list-head--staff">
          <span>Product</span>
          <span class="text-right">Price</span>
          <span class="text-right">Stock</span>
          <span>Inspection</span>
          <span></span>
        </div>

        <div
          v-for="product in visibleProducts"
          :key="product.id"
          draggable="true"
          class="list-row list-row--staff cursor-grab active:cursor-grabbing"
          :class="draggedProduct?.id === product.id && isDragging ? 'opacity-50' : ''"
          @dragstart="startDrag(product)"
          @dragend="endDrag"
        >
          <div class="flex min-w-0 items-center gap-3">
            <img
              v-if="product.image_url"
              :src="product.image_url"
              :alt="product.name"
              class="list-thumb"
              draggable="false"
              loading="lazy"
            />
            <span
              v-else
              class="list-thumb grid place-items-center text-[0.6rem] text-zinc-500"
            >
              No Image
            </span>

            <div class="min-w-0">
              <p class="truncate font-bold text-white">{{ product.name }}</p>
              <p class="truncate text-xs text-red-400">
                {{ product.category || 'Uncategorized' }}
              </p>
            </div>
          </div>

          <p class="text-right text-sm font-bold text-white">
            ₱{{ Number(product.price || 0).toLocaleString() }}
          </p>

          <p class="text-right text-sm font-bold">
            <span :class="Number(product.quantity || 0) <= 10 ? 'text-red-400' : 'text-white'">
              {{ product.quantity }}
            </span>
            <span
              v-if="Number(product.quantity || 0) <= 10"
              class="ml-1 text-[0.6rem] uppercase tracking-wide text-red-400"
              >low</span
            >
          </p>

          <p class="truncate text-xs text-zinc-400">
            {{ product.inspection_date ? formatDate(product.inspection_date) : 'None' }}
          </p>

          <div class="row-actions">
            <button
              class="desktop-only rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              @click="openReportModal(product)"
            >
              Report
            </button>

            <!-- phones: Restore / Report / Delete (drag & drop doesn't work
                 on touch screens) -->
            <button
              class="phone-only rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              @click="manageProduct = product"
            >
              Manage
            </button>
          </div>
        </div>
      </div>

      <!-- the next products load as this comes into view -->
      <div v-if="remaining > 0" ref="listEnd" class="py-5 text-center">
        <button
          class="rounded-xl bg-zinc-800 px-5 py-2 text-sm font-bold text-white hover:bg-zinc-700"
          @click="showMore"
        >
          Show more ({{ remaining }} left)
        </button>
      </div>
    </div>

    <ActionSheet
      v-if="manageProduct"
      :title="manageProduct.name"
      :subtitle="`Archived · Stock: ${manageProduct.quantity}`"
      :actions="manageActions"
      @select="onManageAction"
      @close="manageProduct = null"
    />

    <!-- ACTION BOX (restore / delete by drag & drop; computers only) -->
    <aside class="archive-box desktop-only w-full md:w-[280px]">
      <div class="card p-5 shadow-2xl">
        <h2 class="text-2xl font-bold text-white">Action Box</h2>
        <p class="mb-4 text-sm text-zinc-400">Drag a product here</p>

        <!-- RESTORE ZONE -->
        <div
          class="mb-4 flex min-h-[150px] items-center justify-center rounded-[20px] border-2 border-dashed border-emerald-500 bg-emerald-500/10 p-4 text-center transition"
          :class="dragOverZone === 'restore' ? 'scale-[1.02] bg-emerald-500/20' : ''"
          @dragover.prevent="dragOverZone = 'restore'"
          @dragleave="dragOverZone = null"
          @drop.prevent="openActionModal('restore')"
        >
          <div class="pointer-events-none">
            <strong class="mb-1 block text-xl text-white">↩ Restore</strong>
            <span class="text-sm text-emerald-200">Move back to Inventory</span>
          </div>
        </div>

        <!-- DELETE ZONE -->
        <div
          class="flex min-h-[150px] items-center justify-center rounded-[20px] border-2 border-dashed border-red-500 bg-red-500/10 p-4 text-center transition"
          :class="dragOverZone === 'delete' ? 'scale-[1.02] bg-red-500/20' : ''"
          @dragover.prevent="dragOverZone = 'delete'"
          @dragleave="dragOverZone = null"
          @drop.prevent="openActionModal('delete')"
        >
          <div class="pointer-events-none">
            <strong class="mb-1 block text-xl text-white">🗑 Delete</strong>
            <span class="text-sm text-red-200">Remove product</span>
          </div>
        </div>
      </div>
    </aside>

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
          <b>Product:</b> {{ draggedProduct?.name }}
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
      <div class="w-full max-w-md card p-5">
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
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { useShowMore } from '../../lib/useShowMore'
import PageHeader from '../../components/PageHeader.vue'
import ActionSheet from '../../components/ActionSheet.vue'

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

// ----- Drag & drop (restore / delete) -----
const draggedProduct = ref(null)
const isDragging = ref(false)
const dragOverZone = ref(null) // 'restore' | 'delete' | null
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

// Long lists: 40 rows at a time, more as you scroll (keeps phones fast).
const {
  visible: visibleProducts,
  remaining,
  sentinel: listEnd,
  showMore,
  reset: resetList,
} = useShowMore(filteredProducts)

// a new search or category starts again at the top
watch([search, selectedCategory], resetList)

// ----- Phones: the "Manage" menu of a product -----
// Drag & drop to the Action Box doesn't work on touch screens.
const manageProduct = ref(null)

const manageActions = [
  { key: 'restore', label: '↩ Restore to Inventory', tone: 'success' },
  { key: 'report', label: 'Report a problem' },
  { key: 'delete', label: '🗑 Delete product', hint: 'It will no longer appear in Inventory or Archived', tone: 'danger' },
]

function onManageAction(key) {
  const product = manageProduct.value
  manageProduct.value = null
  if (!product) return

  if (key === 'report') {
    openReportModal(product)
    return
  }

  // same confirmation as dropping it on Restore / Delete
  draggedProduct.value = product
  openActionModal(key)
}

function startDrag(product) {
  draggedProduct.value = product
  isDragging.value = true
}

function endDrag() {
  isDragging.value = false
  dragOverZone.value = null
}

function openActionModal(type) {
  dragOverZone.value = null

  if (!draggedProduct.value) return

  actionError.value = ''
  actionType.value = type
}

function closeActionModal() {
  if (actionSaving.value) return

  actionType.value = null
  actionError.value = ''
  draggedProduct.value = null
}

async function confirmAction() {
  if (!draggedProduct.value || !actionType.value) return

  actionSaving.value = true
  actionError.value = ''

  const rpcName = actionType.value === 'restore' ? 'restore_product' : 'soft_delete_product'

  const { error } = await supabase.rpc(rpcName, {
    p_product_id: draggedProduct.value.id,
  })

  actionSaving.value = false

  if (error) {
    actionError.value = error.message
    return
  }

  // Remove it from the list right away, then refresh from the database
  const movedId = draggedProduct.value.id
  products.value = products.value.filter(product => product.id !== movedId)

  actionType.value = null
  draggedProduct.value = null

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