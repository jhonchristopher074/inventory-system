<template>
  <div>
    <PageHeader title="Calendar" subtitle="Products scheduled for inspection and delivery." />

    <div class="mb-5 flex flex-wrap gap-3 rounded-[20px] border border-white/10 bg-zinc-900 p-2">
      <button
        class="rounded-2xl px-4 py-3 font-bold transition sm:px-5"
        :class="activeTab === 'inspection' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'inspection'"
      >
        Inspection
      </button>

      <button
        class="rounded-2xl px-4 py-3 font-bold transition sm:px-5"
        :class="activeTab === 'delivery' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'delivery'"
      >
        Delivery
      </button>

      <!-- here, not floating over the page: a floating button covered
           the buttons of the table rows under it -->
      <button
        class="ml-auto rounded-2xl border border-red-500/40 bg-red-600/15 px-4 py-3 font-bold text-red-200 transition hover:bg-red-600 hover:text-white"
        title="Add an inspection or delivery schedule"
        @click="openAddModal"
      >
        + Add<span class="hidden sm:inline"> Schedule</span>
      </button>
    </div>

    <p v-if="loading && activeTab === 'delivery'" class="text-sm text-zinc-400">Loading...</p>
    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">{{ errorMessage }}</p>

    <!-- INSPECTION: one table row per product; Details opens the small window below -->
    <InspectionTable
      v-if="activeTab === 'inspection'"
      :rows="inspectionRows"
      :loading="loading"
      action-label="Details"
      storage-key="inspections"
      @open="openPanel"
    />

    <!-- DELIVERY -->
    <div v-if="activeTab === 'delivery'">
      <div
        v-if="deliveries.length === 0"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No delivery schedules.
      </div>

      <div v-else class="grid grid-cols-1 gap-5 sm:grid-cols-[repeat(auto-fill,260px)]">
        <div
          v-for="delivery in deliveries"
          :key="delivery.id"
          class="rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
          :class="isDeliveryOverdue(delivery) ? 'border-red-500/70 bg-red-950/30 shadow-red-500/20' : ''"
        >
          <h2 class="text-xl font-bold text-white">{{ delivery.title }}</h2>

          <p class="mt-3 text-sm text-zinc-400">
            Supplier: {{ delivery.supplier || 'No supplier' }}
          </p>

          <p class="mt-2 text-sm font-bold text-red-400">
            {{ formatDate(delivery.delivery_date) }}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="text-sm text-emerald-400">{{ delivery.status || 'Scheduled' }}</span>
            <span
              v-if="isDeliveryOverdue(delivery)"
              class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400"
            >
              Overdue
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ADD SCHEDULE MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeAddModal"
    >
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-extrabold text-white">Add Schedule</h2>
            <p class="text-sm text-zinc-400">Create inspection or delivery schedule.</p>
          </div>

          <button
            class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="closeAddModal"
          >
            ✕
          </button>
        </div>

        <div class="space-y-4 rounded-3xl bg-black/40 p-5">
          <div>
            <label class="label">Schedule Type</label>
            <select v-model="newSchedule.type" class="input">
              <option value="inspection">Inspection</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          <div v-if="newSchedule.type === 'inspection'" class="space-y-4">
            <div>
              <label class="label">Product</label>

              <div class="relative">
                <button
                  type="button"
                  class="search-select-btn"
                  @click="showProductDropdown = !showProductDropdown"
                >
                  <span :class="productSearch ? 'text-white' : 'text-zinc-500'">
                    {{ productSearch || 'Search product...' }}
                  </span>

                  <span class="text-red-400">
                    {{ showProductDropdown ? '⌃' : '⌄' }}
                  </span>
                </button>

                <div v-if="showProductDropdown" class="search-select-menu">
                  <div class="search-box">
                    <span class="text-xl text-red-400">⌕</span>

                    <input
                      v-model="productSearch"
                      type="text"
                      placeholder="Search product..."
                      class="search-input"
                    />
                  </div>

                  <button
                    v-for="product in filteredAllProducts"
                    :key="product.id"
                    type="button"
                    class="search-item"
                    @click="selectProduct(product)"
                  >
                    <p class="font-bold text-white">{{ product.name }}</p>
                    <p class="text-xs text-zinc-400">
                      {{ product.category || 'Uncategorized' }}
                    </p>
                  </button>

                  <div
                    v-if="filteredAllProducts.length === 0"
                    class="px-4 py-3 text-sm text-zinc-400"
                  >
                    No product found.
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label class="label">Schedule Date</label>
              <input v-model="newSchedule.date" type="date" class="calendar-date-input" />
            </div>
          </div>

          <div v-if="newSchedule.type === 'delivery'" class="space-y-4">
            <div>
              <label class="label">Delivery Title</label>
              <input
                v-model="newSchedule.title"
                type="text"
                placeholder="e.g. Roofing materials delivery"
                class="input"
              />
            </div>

            <div>
              <label class="label">Supplier</label>
              <input
                v-model="newSchedule.supplier"
                type="text"
                placeholder="Supplier name"
                class="input"
              />
            </div>

            <div>
              <label class="label">Delivery Date</label>
              <input v-model="newSchedule.date" type="date" class="calendar-date-input" />
            </div>
          </div>
        </div>

        <p v-if="modalError" class="mt-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
          {{ modalError }}
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
            :disabled="scheduleSaving"
            @click="saveSchedule"
          >
            {{ scheduleSaving ? 'Saving...' : 'Save Schedule' }}
          </button>
        </div>
      </div>
    </div>

    <!-- INSPECTION DETAILS: only what the table row doesn't show
         (who submitted or saved how much) -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
      @keydown.esc="closePanel"
    >
      <div
        class="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspection-title"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="inspection-title" class="text-xl font-bold text-white">
              {{ selectedProduct.name }}
            </h2>
            <p class="text-sm text-zinc-400">
              Inspection {{ formatDate(selectedProduct.inspection_date) }} ·
              batch of {{ inspectionQty(selectedProduct) }}
            </p>
          </div>

          <button
            ref="panelClose"
            type="button"
            class="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="closePanel"
          >
            ✕
          </button>
        </div>

        <!-- approved by the admin so far -->
        <div class="mb-4 flex flex-wrap gap-2 text-xs font-bold">
          <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-emerald-400">
            Approved: {{ selectedProduct.approved_count || 0 }}
          </span>
          <span class="rounded-full bg-red-600/20 px-3 py-1 text-red-400">
            Return: {{ selectedProduct.return_count || 0 }}
          </span>
        </div>

        <h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-400">
          Waiting for your approval ({{ selectedProductSubmittedList.length }})
        </h3>

        <ul v-if="selectedProductSubmittedList.length > 0" class="mb-4 space-y-1.5">
          <li
            v-for="approval in selectedProductSubmittedList"
            :key="approval.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-black px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate text-white">{{ approval.requested_by || 'Staff' }}</span>
            <span class="shrink-0 text-zinc-300">
              Approved {{ approval.approved_qty }} · Return {{ approval.return_qty }}
            </span>
          </li>
        </ul>
        <p v-else class="mb-4 text-sm text-zinc-500">Nothing to approve.</p>

        <h3 class="mb-2 text-xs font-bold uppercase tracking-wider text-lime-400">
          Saved by staff, not submitted yet ({{ selectedProductSavedList.length }})
        </h3>

        <ul v-if="selectedProductSavedList.length > 0" class="mb-5 space-y-1.5">
          <li
            v-for="approval in selectedProductSavedList"
            :key="approval.id"
            class="flex items-center justify-between gap-3 rounded-lg bg-black px-3 py-2 text-sm"
          >
            <span class="min-w-0 truncate text-white">{{ approval.requested_by || 'Staff' }}</span>
            <span class="shrink-0 text-zinc-300">
              Approved {{ approval.approved_qty }} · Return {{ approval.return_qty }}
            </span>
          </li>
        </ul>
        <p v-else class="mb-5 text-sm text-zinc-500">None.</p>

        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            class="flex-1 rounded-xl bg-yellow-600 py-2.5 text-sm font-bold text-white hover:bg-yellow-700"
            @click="$router.push('/approval')"
          >
            Go to Approval Page
          </button>

          <button
            class="flex-1 rounded-xl bg-zinc-800 py-2.5 text-sm font-bold text-white hover:bg-zinc-700"
            @click="closePanel"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import InspectionTable from '../../components/InspectionTable.vue'

const activeTab = ref('inspection')

const products = ref([])
const allProducts = ref([])
const deliveries = ref([])
const approvals = ref([])

const loading = ref(false)
const errorMessage = ref('')

const showAddModal = ref(false)
const modalError = ref('')

const newSchedule = ref({
  type: 'inspection',
  product_id: '',
  title: '',
  supplier: '',
  date: '',
})

const selectedProduct = ref(null)
const panelError = ref('')

const productSearch = ref('')
const showProductDropdown = ref(false)

// One row of the inspection table per scheduled product (see InspectionTable)
const inspectionRows = computed(() =>
  products.value.map(item => ({
    item,
    date: item.inspection_date,
    qty: inspectionQty(item),
    approved: adminApprovedQty(item),
    approvedPct: approvedPercentByProduct(item),
    savedPct: savedPercentByProduct(item),
    submittedPct: submittedPercentByProduct(item),
    totalPct: totalProgressPercent(item),
    remaining: remainingItems(item),
    started: adminApprovedQty(item) + savedQty(item) + submittedQty(item) > 0,
    overdue: isOverdue(item),
    waiting: approvals.value.filter(
      approval => approval.product_id === item.id && approval.status === 'submitted'
    ).length,
  }))
)

const filteredAllProducts = computed(() => {
  const search = productSearch.value.toLowerCase().trim()

  if (!search) return allProducts.value

  return allProducts.value.filter(product =>
    product.name?.toLowerCase().includes(search) ||
    product.category?.toLowerCase().includes(search)
  )
})

const selectedProductSavedList = computed(() => {
  if (!selectedProduct.value) return []

  return approvals.value.filter(item => {
    return item.product_id === selectedProduct.value.id && item.status === 'saved'
  })
})

const selectedProductSubmittedList = computed(() => {
  if (!selectedProduct.value) return []

  return approvals.value.filter(item => {
    return item.product_id === selectedProduct.value.id && item.status === 'submitted'
  })
})

// Name of the product that was actually picked from the list.
const pickedProductName = ref('')

function selectProduct(product) {
  newSchedule.value.product_id = product.id
  pickedProductName.value = product.name
  productSearch.value = product.name
  showProductDropdown.value = false
}

// If the admin edits the search text after picking, the old pick no longer counts,
// so a schedule can't be saved for a different product than the one shown.
watch(productSearch, (text) => {
  if (text !== pickedProductName.value) {
    newSchedule.value.product_id = ''
  }
})

function handleClickOutside(e) {
  const dropdown = document.querySelector('.search-select-btn')
  const menu = document.querySelector('.search-select-menu')

  if (
    showProductDropdown.value &&
    dropdown &&
    menu &&
    !dropdown.contains(e.target) &&
    !menu.contains(e.target)
  ) {
    showProductDropdown.value = false
  }
}

// Today's date on THIS computer's clock (YYYY-MM-DD).
// (toISOString() uses UTC, which is a day behind in the Philippines before 8 AM.)
function getToday() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function adminApprovedQty(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

// Size of the batch being inspected, fixed when the inspection was scheduled.
// Live stock can't be used: sales and returns change it mid-inspection.
function inspectionQty(product) {
  return Number(product?.inspection_qty ?? product?.quantity ?? 0)
}

function approvalTotal(product, status) {
  return approvals.value
    .filter(item => item.product_id === product.id && item.status === status)
    .reduce((sum, item) => {
      return sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0)
    }, 0)
}

function savedQty(product) {
  return approvalTotal(product, 'saved')
}

function submittedQty(product) {
  return approvalTotal(product, 'submitted')
}

function remainingItems(product) {
  const quantity = inspectionQty(product)

  return Math.max(
    quantity - adminApprovedQty(product) - savedQty(product) - submittedQty(product),
    0
  )
}

function percent(value, quantity) {
  const total = Number(quantity || 0)
  if (total <= 0) return 0

  return Math.min(Math.round((Number(value || 0) / total) * 100), 100)
}

function approvedPercentByProduct(product) {
  return percent(adminApprovedQty(product), inspectionQty(product))
}

function savedPercentByProduct(product) {
  return percent(savedQty(product), inspectionQty(product))
}

function submittedPercentByProduct(product) {
  return percent(submittedQty(product), inspectionQty(product))
}

function totalProgressPercent(product) {
  return Math.min(
    approvedPercentByProduct(product) +
      savedPercentByProduct(product) +
      submittedPercentByProduct(product),
    100
  )
}

function isOverdue(product) {
  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  return product.inspection_date < getToday() && totalDone < quantity
}

function shouldShowInCalendar(product, today) {
  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && totalDone < quantity

  return isTodayOrFuture || isPastButUnfinished
}

// ----- Deliveries -----
function isDelivered(delivery) {
  return ['delivered', 'done', 'completed'].includes(
    String(delivery.status || '').trim().toLowerCase()
  )
}

function isDeliveryOverdue(delivery) {
  if (!delivery.delivery_date) return false
  return String(delivery.delivery_date).slice(0, 10) < getToday()
}

async function fetchApprovals() {
  const { data, error } = await supabase.rpc('list_active_approvals')

  if (!error) {
    approvals.value = data || []
  }
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const today = getToday()

  await fetchApprovals()

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'active',
    p_order_by: 'inspection_asc',
  })

  if (error) {
    errorMessage.value = error.message
  } else {
    allProducts.value = data || []

    const visibleProducts = (data || [])
      .filter(product => product.inspection_date)
      .filter(product => shouldShowInCalendar(product, today))

    products.value = visibleProducts

    await createOverdueNotifications(visibleProducts)
  }

  loading.value = false
}

async function fetchDeliveries() {
  const { data, error } = await supabase.rpc('list_deliveries')

  if (!error) {
    // Finished deliveries disappear from the calendar
    deliveries.value = (data || []).filter(delivery => !isDelivered(delivery))
  }
}

function openAddModal() {
  newSchedule.value = {
    type: activeTab.value,
    product_id: '',
    title: '',
    supplier: '',
    date: '',
  }

  pickedProductName.value = ''
  productSearch.value = ''
  showProductDropdown.value = false
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
  modalError.value = ''
  productSearch.value = ''
  showProductDropdown.value = false
}

// true while saving: a double click used to create the delivery twice
const scheduleSaving = ref(false)

async function saveSchedule() {
  if (scheduleSaving.value) return

  modalError.value = ''

  if (!newSchedule.value.date) {
    modalError.value = 'Please select a date.'
    return
  }

  scheduleSaving.value = true

  try {
    if (newSchedule.value.type === 'inspection') {
      if (!newSchedule.value.product_id) {
        modalError.value = 'Please select a product.'
        return
      }

      const { error } = await supabase.rpc('schedule_inspection', {
        p_product_id: newSchedule.value.product_id,
        p_date: newSchedule.value.date,
      })

      if (error) {
        modalError.value = error.message
        return
      }
    }

    if (newSchedule.value.type === 'delivery') {
      if (!newSchedule.value.title.trim()) {
        modalError.value = 'Please enter delivery title.'
        return
      }

      const { error } = await supabase.rpc('create_delivery', {
        p_title: newSchedule.value.title.trim(),
        p_supplier: newSchedule.value.supplier.trim() || null,
        p_date: newSchedule.value.date,
      })

      if (error) {
        modalError.value = error.message
        return
      }
    }

    closeAddModal()
    await fetchProducts()
    await fetchDeliveries()
  } finally {
    scheduleSaving.value = false
  }
}

// Remember which overdue products already triggered a notification during this visit,
// so reloading the list after every save doesn't fire the same notification again.
const notifiedOverdue = new Set()

async function createOverdueNotifications(items) {
  for (const item of items) {
    if (!isOverdue(item)) continue
    if (notifiedOverdue.has(item.id)) continue
    notifiedOverdue.add(item.id)

    const quantity = inspectionQty(item)
    const totalDone = adminApprovedQty(item) + savedQty(item) + submittedQty(item)

    await supabase.rpc('create_overdue_notification', {
      p_product_id: item.id,
      p_total_done: totalDone,
      p_quantity: quantity,
    })
  }
}

function formatDate(date) {
  if (!date) return 'No date'

  // "2026-10-13" must be read as a local date, not UTC midnight (can show the day before).
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const panelClose = ref(null)

async function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''

  // focus inside the window, so Esc closes it
  await nextTick()
  panelClose.value?.focus()
}

function closePanel() {
  selectedProduct.value = null
  panelError.value = ''
}

onMounted(async () => {
  await fetchProducts()
  await fetchDeliveries()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
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

.search-select-btn {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.search-select-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 16rem;
  overflow-y: auto;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #18181b;
  padding: 0.6rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.search-box {
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #27272a;
  padding: 0.7rem 1rem;
  position: sticky;
  top: 0;
}

.search-input {
  width: 100%;
  background: transparent;
  color: white;
  outline: none;
}

.search-input::placeholder {
  color: #71717a;
}

.search-item {
  width: 100%;
  border-radius: 0.75rem;
  padding: 0.75rem 1rem;
  text-align: left;
  color: white;
}

.search-item:hover {
  background: #3f3f46;
}

.calendar-date-input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgb(39 39 42);
  padding: 0.85rem 1rem;
  color: white;
  outline: none;
  color-scheme: dark;
}

.calendar-date-input:focus {
  border-color: rgb(239 68 68);
}

.calendar-date-input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}
</style>