<template>
  <div>
    <PageHeader title="Calendar" subtitle="Products scheduled for inspection and delivery." />

    <div class="mb-5 flex gap-3 rounded-[20px] border border-white/10 bg-zinc-900 p-2">
      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'inspection' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'inspection'"
      >
        Inspection
      </button>

      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'delivery' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'delivery'"
      >
        Delivery
      </button>
    </div>

    <p v-if="loading" class="text-sm text-zinc-400">Loading...</p>
    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">{{ errorMessage }}</p>

    <!-- INSPECTION -->
    <div v-if="activeTab === 'inspection'">
      <div
        v-if="!loading && groupedInspectionDates.length === 0"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No inspection schedules.
      </div>

      <div v-else class="space-y-5">
        <div
          v-for="group in groupedInspectionDates"
          :key="group.date"
          class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
        >
          <div class="mb-4">
            <h2 class="text-2xl font-bold text-white">{{ formatDate(group.date) }}</h2>
            <p class="text-sm text-zinc-400">{{ group.items.length }} product(s)</p>
          </div>

          <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
            <div
              v-for="item in group.items"
              :key="item.id"
              class="flex min-h-[380px] flex-col justify-between rounded-[22px] border border-white/10 bg-black p-4 shadow-xl"
              :class="isOverdue(item) ? 'border-red-500/70 bg-red-950/30 shadow-red-500/20' : ''"
            >
              <div>
                <h3 class="text-xl font-bold text-white">{{ item.name }}</h3>

                <p class="mt-2 text-sm text-red-400">
                  {{ item.category || 'Uncategorized' }}
                </p>

                <p class="mt-2 text-sm text-zinc-300">
                  Qty: {{ item.quantity }}
                </p>

                <p class="mt-2 text-sm text-zinc-300">
                  Admin Approved: {{ adminApprovedQty(item) }} / {{ item.quantity }}
                </p>

                <p class="mt-1 text-sm text-lime-400">
                  Saved: {{ savedQty(item) }}
                </p>

                <p class="mt-1 text-sm text-yellow-400">
                  Submitted: {{ submittedQty(item) }}
                </p>

                <p class="mt-1 text-sm font-bold text-yellow-400">
                  Remaining: {{ remainingItems(item) }}
                </p>

                <div class="mt-3">
                  <div class="mb-1 flex justify-between text-xs">
                    <span class="text-zinc-400">Inspection Progress</span>
                    <span class="font-bold text-white">{{ totalProgressPercent(item) }}%</span>
                  </div>

                  <div class="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      class="h-full bg-red-600 transition-all"
                      :style="{ width: approvedPercentByProduct(item) + '%' }"
                    ></div>

                    <div
                      class="h-full bg-lime-400 transition-all"
                      :style="{ width: savedPercentByProduct(item) + '%' }"
                    ></div>

                    <div
                      class="h-full bg-yellow-400 transition-all"
                      :style="{ width: submittedPercentByProduct(item) + '%' }"
                    ></div>
                  </div>

                  <div class="mt-2 flex flex-wrap gap-2 text-[10px]">
                    <span class="text-red-400">Red: Approved</span>
                    <span class="text-lime-400">Green: Saved</span>
                    <span class="text-yellow-400">Yellow: Submitted</span>
                  </div>
                </div>

                <span
                  v-if="isOverdue(item)"
                  class="mt-3 inline-block rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400"
                >
                  Overdue / Unfinished
                </span>

                <div class="mt-3 flex flex-wrap gap-2">
                  <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400">
                    Approved: {{ item.approved_count || 0 }}
                  </span>

                  <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
                    Return: {{ item.return_count || 0 }}
                  </span>
                </div>
              </div>

              <button
                class="mt-4 w-full rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700"
                @click="openPanel(item)"
              >
                Open Product
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- DELIVERY -->
    <div v-if="activeTab === 'delivery'">
      <div
        v-if="deliveries.length === 0"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No delivery schedules.
      </div>

      <div v-else class="grid grid-cols-[repeat(auto-fill,260px)] gap-5">
        <div
          v-for="delivery in deliveries"
          :key="delivery.id"
          class="rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
        >
          <h2 class="text-xl font-bold text-white">{{ delivery.title }}</h2>

          <p class="mt-3 text-sm text-zinc-400">
            Supplier: {{ delivery.supplier || 'No supplier' }}
          </p>

          <p class="mt-2 text-sm font-bold text-red-400">
            {{ formatDate(delivery.delivery_date) }}
          </p>

          <p class="mt-2 text-sm text-emerald-400">
            {{ delivery.status || 'Scheduled' }}
          </p>
        </div>
      </div>
    </div>

    <!-- PLUS BUTTON -->
    <button
      class="fixed bottom-10 right-10 z-40 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-3xl font-extrabold text-white shadow-[0_0_25px_rgba(239,68,68,0.45)] transition hover:scale-105 hover:bg-red-700"
      @click="openAddModal"
    >
      +
    </button>

    <!-- ADD SCHEDULE MODAL -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="closeAddModal"
    >
      <div class="w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#18181b] p-6 shadow-2xl">
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
            class="rounded-2xl bg-red-600 px-10 py-3 font-bold text-white hover:bg-red-700"
            @click="saveSchedule"
          >
            Save Schedule
          </button>
        </div>
      </div>
    </div>

    <!-- INSPECTION PANEL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
    >
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 class="mb-3 text-xl font-bold text-white">Product Inspection</h2>

        <p class="text-sm text-zinc-300">
          <b>Product:</b> {{ selectedProduct.name }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Category:</b> {{ selectedProduct.category }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Quantity:</b> {{ selectedProduct.quantity }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Admin Approved:</b> {{ adminApprovedQty(selectedProduct) }}
        </p>

        <p class="text-sm text-lime-400">
          <b>Saved:</b> {{ savedQty(selectedProduct) }}
        </p>

        <p class="text-sm text-yellow-400">
          <b>Submitted:</b> {{ submittedQty(selectedProduct) }}
        </p>

        <p class="mb-4 text-sm font-bold text-yellow-400">
          <b>Remaining:</b> {{ remainingItems(selectedProduct) }}
        </p>

        <div class="mb-3 rounded-xl border border-white/10 bg-black p-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs text-zinc-400">Inspection Progress</span>
            <span class="text-xs font-bold text-white">
              {{ totalProgressPercent(selectedProduct) }}%
            </span>
          </div>

          <div class="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              class="h-full bg-red-600"
              :style="{ width: approvedPercentByProduct(selectedProduct) + '%' }"
            ></div>

            <div
              class="h-full bg-lime-400"
              :style="{ width: savedPercentByProduct(selectedProduct) + '%' }"
            ></div>

            <div
              class="h-full bg-yellow-400"
              :style="{ width: submittedPercentByProduct(selectedProduct) + '%' }"
            ></div>
          </div>

          <div class="mt-2 flex flex-wrap gap-2 text-[10px]">
            <span class="text-red-400">Red: Approved</span>
            <span class="text-lime-400">Green: Saved</span>
            <span class="text-yellow-400">Yellow: Submitted</span>
          </div>
        </div>

        <div
          v-if="selectedProductSubmittedList.length > 0"
          class="mb-3 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3"
        >
          <p class="mb-2 text-xs font-bold text-yellow-400">Submitted to Admin</p>

          <div
            v-for="approval in selectedProductSubmittedList"
            :key="approval.id"
            class="mb-2 rounded-lg bg-black p-2 text-xs text-white"
          >
            Approved: {{ approval.approved_qty }} |
            Return: {{ approval.return_qty }}
            <span class="text-zinc-400"> • {{ approval.requested_by || 'Staff' }}</span>
          </div>
        </div>

        <div
          v-if="selectedProductSavedList.length > 0"
          class="mb-3 rounded-xl border border-lime-500/20 bg-lime-500/10 p-3"
        >
          <p class="mb-2 text-xs font-bold text-lime-400">Saved Not Submitted</p>

          <div
            v-for="approval in selectedProductSavedList"
            :key="approval.id"
            class="mb-2 rounded-lg bg-black p-2 text-xs text-white"
          >
            Approved: {{ approval.approved_qty }} |
            Return: {{ approval.return_qty }}
            <span class="text-zinc-400"> • {{ approval.requested_by || 'Staff' }}</span>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-yellow-600 py-2 text-sm font-semibold text-white hover:bg-yellow-700"
            @click="$router.push('/approval')"
          >
            Go to Approval Page
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

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

const groupedInspectionDates = computed(() => {
  const grouped = {}

  products.value.forEach(product => {
    if (!product.inspection_date) return

    if (!grouped[product.inspection_date]) {
      grouped[product.inspection_date] = []
    }

    grouped[product.inspection_date].push(product)
  })

  return Object.keys(grouped)
    .sort((a, b) => new Date(a) - new Date(b))
    .map(date => ({
      date,
      items: grouped[date],
    }))
})

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

function selectProduct(product) {
  newSchedule.value.product_id = product.id
  productSearch.value = product.name
  showProductDropdown.value = false
}

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

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function adminApprovedQty(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
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
  const quantity = Number(product.quantity || 0)

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
  return percent(adminApprovedQty(product), product.quantity)
}

function savedPercentByProduct(product) {
  return percent(savedQty(product), product.quantity)
}

function submittedPercentByProduct(product) {
  return percent(submittedQty(product), product.quantity)
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
  const quantity = Number(product.quantity || 0)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  return product.inspection_date < getToday() && totalDone < quantity
}

function shouldShowInCalendar(product, today) {
  const quantity = Number(product.quantity || 0)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && totalDone < quantity

  return isTodayOrFuture || isPastButUnfinished
}

async function fetchApprovals() {
  const { data, error } = await supabase
    .from('inspection_approvals')
    .select('*')
    .in('status', ['saved', 'submitted'])

  if (!error) {
    approvals.value = data || []
  }
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const today = getToday()

  await fetchApprovals()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('inspection_date', { ascending: true })

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
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .order('delivery_date', { ascending: true })

  if (!error) {
    deliveries.value = data || []
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

async function saveSchedule() {
  modalError.value = ''

  if (!newSchedule.value.date) {
    modalError.value = 'Please select a date.'
    return
  }

  if (newSchedule.value.type === 'inspection') {
    if (!newSchedule.value.product_id) {
      modalError.value = 'Please select a product.'
      return
    }

    const { error } = await supabase
      .from('products')
      .update({
        inspection_date: newSchedule.value.date,
        approved_count: 0,
        return_count: 0,
        inspection_result: null,
      })
      .eq('id', newSchedule.value.product_id)

    if (error) {
      modalError.value = error.message
      return
    }

    await supabase
      .from('inspection_approvals')
      .delete()
      .eq('product_id', newSchedule.value.product_id)

    await supabase.from('notifications').insert({
      title: 'Inspection Scheduled',
      message: 'A product inspection schedule was created.',
      type: 'inspection',
      product_id: newSchedule.value.product_id,
      is_read: false,
    })
  }

  if (newSchedule.value.type === 'delivery') {
    if (!newSchedule.value.title.trim()) {
      modalError.value = 'Please enter delivery title.'
      return
    }

    const { error } = await supabase.from('deliveries').insert({
      title: newSchedule.value.title.trim(),
      supplier: newSchedule.value.supplier.trim() || null,
      delivery_date: newSchedule.value.date,
      status: 'Scheduled',
    })

    if (error) {
      modalError.value = error.message
      return
    }
  }

  closeAddModal()
  await fetchProducts()
  await fetchDeliveries()
}

async function createOverdueNotifications(items) {
  for (const item of items) {
    if (!isOverdue(item)) continue

    const quantity = Number(item.quantity || 0)
    const totalDone = adminApprovedQty(item) + savedQty(item) + submittedQty(item)

    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('product_id', item.id)
      .eq('type', 'overdue')
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from('notifications').insert({
        title: 'Overdue Inspection',
        message: `${item.name} inspection is overdue. Inspected ${totalDone} out of ${quantity}.`,
        type: 'overdue',
        product_id: item.id,
      })
    }
  }
}

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''
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