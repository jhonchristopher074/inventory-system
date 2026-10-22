<template>
  <div>
    <PageHeader
      title="Staff Calendar"
      subtitle="Inspect products and manage inspection submissions."
    />

    <div class="mb-5 flex gap-3 rounded-[20px] border border-white/10 bg-zinc-900 p-2">
      <button
        class="tab-btn"
        :class="activeTab === 'inspection' ? 'tab-active' : 'tab-inactive'"
        @click="activeTab = 'inspection'"
      >
        Inspection
      </button>

      <button
        class="tab-btn"
        :class="activeTab === 'delivery' ? 'tab-active' : 'tab-inactive'"
        @click="activeTab = 'delivery'"
      >
        Delivery
      </button>
    </div>

    <p v-if="loading && activeTab === 'delivery'" class="text-sm text-zinc-400">Loading...</p>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ errorMessage }}
    </p>

    <!-- INSPECTION: one table row per product; Inspect opens the form below -->
    <InspectionTable
      v-if="activeTab === 'inspection'"
      :rows="inspectionRows"
      :loading="loading"
      action-label="Inspect"
      storage-key="staffInspections"
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
          class="flex flex-col justify-between rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
          :class="isDeliveryOverdue(delivery) ? 'border-red-500/70 bg-red-950/30 shadow-red-500/20' : ''"
        >
          <div>
            <h2 class="text-xl font-bold text-white">{{ delivery.title }}</h2>
            <p class="mt-3 text-sm text-zinc-400">Supplier: {{ delivery.supplier || 'No supplier' }}</p>
            <p class="mt-2 text-sm font-bold text-red-400">{{ formatDate(delivery.delivery_date) }}</p>

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

          <button
            class="mt-4 w-full rounded-xl bg-emerald-600 py-2 text-sm font-bold text-white transition hover:bg-emerald-700"
            @click="openDeliveryDone(delivery)"
          >
            ✓ Mark as Delivered
          </button>
        </div>
      </div>
    </div>

    <!-- CONFIRM DELIVERY DONE -->
    <div
      v-if="deliveryToFinish"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeDeliveryDone"
    >
      <div class="max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <h2 class="mb-3 text-xl font-bold text-white">Mark as Delivered</h2>

        <p class="text-sm text-zinc-300"><b>Delivery:</b> {{ deliveryToFinish.title }}</p>
        <p class="text-sm text-zinc-300"><b>Supplier:</b> {{ deliveryToFinish.supplier || 'No supplier' }}</p>
        <p class="mb-4 text-sm text-zinc-300"><b>Date:</b> {{ formatDate(deliveryToFinish.delivery_date) }}</p>

        <p class="mb-4 text-sm text-zinc-400">
          Confirm this delivery has arrived? It will be removed from the calendar.
        </p>

        <p v-if="deliveryError" class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400">
          {{ deliveryError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            :disabled="deliverySaving"
            @click="confirmDeliveryDone"
          >
            {{ deliverySaving ? 'Saving...' : 'Yes, Delivered' }}
          </button>

          <button
            class="w-full rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            :disabled="deliverySaving"
            @click="closeDeliveryDone"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    <!-- INSPECTION WINDOW: count the batch, save, then submit to the admin -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
      @keydown.esc="closePanel"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspect-title"
      >
        <!-- HEADER -->
        <div class="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div class="min-w-0">
            <h2 id="inspect-title" class="text-xl font-bold text-white">{{ selectedProduct.name }}</h2>
            <p class="text-sm text-zinc-400">
              <span class="text-red-400">{{ selectedProduct.category || 'Uncategorized' }}</span>
              · {{ formatDate(selectedProduct.inspection_date) }}
              · batch of {{ inspectionQty(selectedProduct) }}
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

        <div class="space-y-5 overflow-y-auto px-5 py-5">
          <!-- PROGRESS: the numbers under the bar are its legend -->
          <div>
            <div class="mb-2 flex items-baseline justify-between gap-3 text-sm">
              <span class="font-bold text-white">{{ liveTotalProgressPercent }}% inspected</span>
              <span class="text-zinc-400">
                <b class="text-white">{{ remainingInspectable(selectedProduct) }}</b> left
              </span>
            </div>

            <div class="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div class="h-full bg-red-600 transition-all duration-300" :style="{ width: approvedSegmentPercent + '%' }"></div>
              <div class="h-full bg-lime-400 transition-all duration-300" :style="{ width: savedSegmentPercent + '%' }"></div>
              <div class="h-full bg-yellow-400 transition-all duration-300" :style="{ width: submittedSegmentPercent + '%' }"></div>
            </div>

            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>
                Approved by admin <b class="text-white">{{ adminApprovedQty(selectedProduct) }}</b>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-lime-400" aria-hidden="true"></span>
                Saved <b class="text-white">{{ savedQty(selectedProduct) }}</b>
              </span>
              <span class="flex items-center gap-1.5">
                <span class="h-2 w-2 rounded-full bg-yellow-400" aria-hidden="true"></span>
                Submitted <b class="text-white">{{ submittedQty(selectedProduct) }}</b>
              </span>
            </div>
          </div>

          <!-- THE FORM -->
          <div class="rounded-xl border border-white/10 bg-black/40 p-4">
            <p class="mb-3 text-sm font-bold text-white">
              {{ editingApprovalId ? 'Your saved inspection' : 'Your inspection' }}
            </p>

            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="mb-1 block text-xs font-semibold text-zinc-300">Approved (good)</span>
                <input
                  v-model.number="approvedQty"
                  type="number"
                  min="0"
                  :max="maxApprovedInput"
                  inputmode="numeric"
                  class="inspection-input"
                  @input="limitApproved"
                />
                <span class="mt-1 block text-[11px] text-zinc-500">up to {{ maxApprovedInput }}</span>
              </label>

              <label class="block">
                <span class="mb-1 block text-xs font-semibold text-zinc-300">Return</span>
                <input
                  v-model.number="returnQty"
                  type="number"
                  min="0"
                  :max="maxReturnInput"
                  inputmode="numeric"
                  class="inspection-input"
                  @input="limitReturn"
                />
                <span class="mt-1 block text-[11px] text-zinc-500">up to {{ maxReturnInput }}</span>
              </label>
            </div>

            <p class="mt-3 text-xs text-zinc-400">
              Counting <b class="text-white">{{ liveInputQty }}</b> of the
              {{ availableForEditing }} not inspected yet.
            </p>
          </div>

          <!-- MESSAGES -->
          <p v-if="panelMessage" class="rounded-lg bg-emerald-600/20 p-3 text-sm text-emerald-400" role="status">
            {{ panelMessage }}
          </p>
          <p v-if="panelError" class="rounded-lg bg-red-600/20 p-3 text-sm text-red-400" role="alert">
            {{ panelError }}
          </p>

          <!-- THIS BATCH'S INSPECTIONS (only when there are some) -->
          <div v-if="selectedProductSavedList.length || selectedProductSubmittedList.length">
            <p class="mb-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-zinc-500">
              Inspections of this batch
            </p>

            <ul class="space-y-2">
              <li
                v-for="approval in selectedProductSavedList"
                :key="approval.id"
                class="rounded-xl border border-lime-500/20 bg-black/40 px-3 py-2.5"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0 text-sm">
                    <p class="truncate font-semibold text-white">
                      {{ isMyApproval(approval) ? 'You' : approval.requested_by || 'Staff' }}
                    </p>
                    <p class="text-xs text-zinc-400">
                      Approved {{ approval.approved_qty }} · Return {{ approval.return_qty }}
                    </p>
                  </div>
                  <span class="shrink-0 rounded-full bg-lime-500/15 px-2 py-0.5 text-[11px] font-bold text-lime-400">
                    Saved, not submitted
                  </span>
                </div>

                <div v-if="isMyApproval(approval)" class="mt-2 flex gap-2">
                  <button
                    class="flex-1 rounded-lg bg-yellow-500 py-1.5 text-xs font-bold text-black hover:bg-yellow-400 disabled:opacity-50"
                    :disabled="panelBusy"
                    @click="submitSavedApproval(approval)"
                  >
                    Submit to admin
                  </button>
                  <button
                    class="flex-1 rounded-lg bg-zinc-800 py-1.5 text-xs font-bold text-red-300 hover:bg-zinc-700 disabled:opacity-50"
                    :disabled="panelBusy"
                    @click="removeSavedInspection(approval)"
                  >
                    Remove
                  </button>
                </div>
              </li>

              <li
                v-for="approval in selectedProductSubmittedList"
                :key="approval.id"
                class="flex items-center justify-between gap-3 rounded-xl border border-yellow-500/20 bg-black/40 px-3 py-2.5"
              >
                <div class="min-w-0 text-sm">
                  <p class="truncate font-semibold text-white">
                    {{ isMyApproval(approval) ? 'You' : approval.requested_by || 'Staff' }}
                  </p>
                  <p class="text-xs text-zinc-400">
                    Approved {{ approval.approved_qty }} · Return {{ approval.return_qty }}
                  </p>
                </div>
                <span class="shrink-0 rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-bold text-yellow-400">
                  Waiting for admin
                </span>
              </li>
            </ul>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="flex gap-2 border-t border-white/10 px-5 py-4">
          <button
            class="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700"
            @click="closePanel"
          >
            Close
          </button>
          <button
            class="flex-[2] rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
            :disabled="panelBusy"
            @click="saveInspection"
          >
            {{ panelBusy ? 'Saving...' : editingApprovalId ? 'Update Saved Inspection' : 'Save Inspection' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import InspectionTable from '../../components/InspectionTable.vue'

const activeTab = ref('inspection')

const inspections = ref([])
const approvals = ref([])
const deliveries = ref([])

const loading = ref(false)
const errorMessage = ref('')
const panelError = ref('')
const panelMessage = ref('')

const selectedProduct = ref(null)
const approvedQty = ref(0)
const returnQty = ref(0)
const editingApprovalId = ref(null)

const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
const currentStaffName = currentUser.full_name || currentUser.email || 'Staff'

// One row of the inspection table per product to inspect (see InspectionTable)
const inspectionRows = computed(() =>
  inspections.value.map(item => ({
    item,
    date: item.inspection_date,
    qty: inspectionQty(item),
    approved: adminApprovedQty(item),
    approvedPct: approvedPercentByProduct(item),
    savedPct: savedPercentByProduct(item),
    submittedPct: submittedPercentByProduct(item),
    totalPct: totalProgressPercent(item),
    remaining: remainingInspectable(item),
    started: adminApprovedQty(item) + savedQty(item) + submittedQty(item) > 0,
    overdue: isOverdue(item),
    waiting: productApprovals(item, 'submitted').length,
    mine: productApprovals(item, 'saved').some(isMyApproval),
  }))
)

const selectedProductSavedList = computed(() => {
  if (!selectedProduct.value) return []
  return approvals.value.filter(item =>
    item.product_id === selectedProduct.value.id && item.status === 'saved'
  )
})

const selectedProductSubmittedList = computed(() => {
  if (!selectedProduct.value) return []
  return approvals.value.filter(item =>
    item.product_id === selectedProduct.value.id && item.status === 'submitted'
  )
})

const currentEditingApproval = computed(() => {
  if (!editingApprovalId.value) return null
  return approvals.value.find(item => item.id === editingApprovalId.value) || null
})

const oldEditingQty = computed(() => {
  if (!currentEditingApproval.value) return 0
  return (
    Number(currentEditingApproval.value.approved_qty || 0) +
    Number(currentEditingApproval.value.return_qty || 0)
  )
})

const liveInputQty = computed(() => {
  return Number(approvedQty.value || 0) + Number(returnQty.value || 0)
})

const availableForEditing = computed(() => {
  if (!selectedProduct.value) return 0
  const baseRemaining = remainingInspectable(selectedProduct.value)
  if (!currentEditingApproval.value) return baseRemaining
  return baseRemaining + oldEditingQty.value
})

const maxApprovedInput = computed(() => {
  return Math.max(availableForEditing.value - Number(returnQty.value || 0), 0)
})

const maxReturnInput = computed(() => {
  return Math.max(availableForEditing.value - Number(approvedQty.value || 0), 0)
})

const approvedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  return percent(adminApprovedQty(selectedProduct.value), inspectionQty(selectedProduct.value))
})

const savedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  const liveSaved = savedQty(selectedProduct.value) - oldEditingQty.value + liveInputQty.value
  return percent(liveSaved, inspectionQty(selectedProduct.value))
})

const submittedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0
  return percent(submittedQty(selectedProduct.value), inspectionQty(selectedProduct.value))
})

const liveTotalProgressPercent = computed(() => {
  return Math.min(
    approvedSegmentPercent.value + savedSegmentPercent.value + submittedSegmentPercent.value,
    100
  )
})

// Logged-in user's id: inspections are "mine" by id, so renaming yourself
// or sharing a name with someone else no longer mixes them up.
const myUserId = ref(null)

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession()
  myUserId.value = session?.user?.id || null
  await fetchAll()
})

async function fetchAll() {
  // approvals first: the visibility filter needs saved/submitted totals
  await fetchApprovals()
  await fetchInspections()
  await fetchDeliveries()
}

async function fetchInspections() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_products', {
    p_filter: 'inspection',
    p_order_by: 'inspection_asc',
  })

  if (error) {
    errorMessage.value = error.message
    inspections.value = []
  } else {
    // Same rule as the Admin calendar: hide products whose inspection date has
    // passed AND are already fully inspected. Approvals must be loaded first.
    const today = getToday()
    inspections.value = (data || []).filter(product => shouldShowInCalendar(product, today))
  }

  loading.value = false
}

async function fetchApprovals() {
  const { data, error } = await supabase.rpc('list_active_approvals')

  if (!error) {
    approvals.value = data || []
  }
}

// Today's date on this computer's clock (YYYY-MM-DD).
function getToday() {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function shouldShowInCalendar(product, today) {
  if (!product.inspection_date) return false

  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && totalDone < quantity

  return isTodayOrFuture || isPastButUnfinished
}

// Same rule as the Admin calendar: inspection date has passed
// and not every item has been approved, saved or submitted yet.
function isOverdue(product) {
  if (!product.inspection_date) return false

  const quantity = inspectionQty(product)
  const totalDone = adminApprovedQty(product) + savedQty(product) + submittedQty(product)

  return product.inspection_date < getToday() && totalDone < quantity
}

async function fetchDeliveries() {
  const { data, error } = await supabase.rpc('list_deliveries')

  if (!error) {
    // Finished deliveries disappear from the calendar
    deliveries.value = (data || []).filter(delivery => !isDelivered(delivery))
  }
}

// ----- Delivery done -----
const deliveryToFinish = ref(null)
const deliveryError = ref('')
const deliverySaving = ref(false)

function isDelivered(delivery) {
  return ['delivered', 'done', 'completed'].includes(
    String(delivery.status || '').trim().toLowerCase()
  )
}

function isDeliveryOverdue(delivery) {
  if (!delivery.delivery_date) return false
  return String(delivery.delivery_date).slice(0, 10) < getToday()
}

function openDeliveryDone(delivery) {
  deliveryToFinish.value = delivery
  deliveryError.value = ''
}

function closeDeliveryDone() {
  if (deliverySaving.value) return
  deliveryToFinish.value = null
  deliveryError.value = ''
}

async function confirmDeliveryDone() {
  if (!deliveryToFinish.value) return

  deliverySaving.value = true
  deliveryError.value = ''

  const { error } = await supabase.rpc('mark_delivery_done', {
    p_delivery_id: deliveryToFinish.value.id,
    p_done_by: currentStaffName,
  })

  deliverySaving.value = false

  if (error) {
    deliveryError.value = error.message
    return
  }

  // Remove it right away, then refresh from the database
  const doneId = deliveryToFinish.value.id
  deliveries.value = deliveries.value.filter(delivery => delivery.id !== doneId)
  deliveryToFinish.value = null

  await fetchDeliveries()
}

function productApprovals(product, status) {
  return approvals.value.filter(item =>
    item.product_id === product.id && item.status === status
  )
}

function approvalTotal(list) {
  return list.reduce((sum, item) => {
    return sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0)
  }, 0)
}

function savedQty(product) {
  return approvalTotal(productApprovals(product, 'saved'))
}

function submittedQty(product) {
  return approvalTotal(productApprovals(product, 'submitted'))
}

function adminApprovedQty(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

// Size of the batch being inspected, fixed when the inspection was scheduled.
// Live stock can't be used: sales and returns change it mid-inspection.
function inspectionQty(product) {
  return Number(product?.inspection_qty ?? product?.quantity ?? 0)
}

function remainingInspectable(product) {
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

// Saved before ids were recorded (requested_by_id empty)? Then by name, as before.
function isMyApproval(approval) {
  if (approval.requested_by_id) return approval.requested_by_id === myUserId.value
  return approval.requested_by === currentStaffName
}

const panelClose = ref(null)

function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''
  panelMessage.value = ''

  // focus inside the window, so Esc closes it
  nextTick(() => panelClose.value?.focus())

  const mine = approvals.value.find(item =>
    item.product_id === product.id &&
    item.status === 'saved' &&
    isMyApproval(item)
  )

  if (mine) {
    editingApprovalId.value = mine.id
    approvedQty.value = Number(mine.approved_qty || 0)
    returnQty.value = Number(mine.return_qty || 0)
  } else {
    editingApprovalId.value = null
    approvedQty.value = 0
    returnQty.value = 0
  }
}

function closePanel() {
  selectedProduct.value = null
  approvedQty.value = 0
  returnQty.value = 0
  editingApprovalId.value = null
  panelError.value = ''
  panelMessage.value = ''
}

function limitApproved() {
  let approved = Number(approvedQty.value || 0)
  let returned = Number(returnQty.value || 0)
  if (approved < 0) approved = 0
  if (returned < 0) returned = 0
  if (approved + returned > availableForEditing.value) {
    approved = availableForEditing.value - returned
  }
  approvedQty.value = Math.max(approved, 0)
  returnQty.value = Math.max(returned, 0)
}

function limitReturn() {
  let approved = Number(approvedQty.value || 0)
  let returned = Number(returnQty.value || 0)
  if (approved < 0) approved = 0
  if (returned < 0) returned = 0
  if (approved + returned > availableForEditing.value) {
    returned = availableForEditing.value - approved
  }
  approvedQty.value = Math.max(approved, 0)
  returnQty.value = Math.max(returned, 0)
}

// true while Save / Submit / Remove is running: the buttons are greyed out
// (a double click on Save used to create two drafts for the same items)
const panelBusy = ref(false)

async function saveInspection() {
  if (panelBusy.value) return

  panelError.value = ''
  panelMessage.value = ''

  if (!selectedProduct.value) return

  limitApproved()
  limitReturn()

  const approved = Number(approvedQty.value || 0)
  const returned = Number(returnQty.value || 0)
  const total = approved + returned

  if (total <= 0) {
    panelError.value = 'Enter approved or return quantity first.'
    return
  }

  if (total > availableForEditing.value) {
    panelError.value = `You can only inspect ${availableForEditing.value} remaining item(s).`
    return
  }

  const isEditing = Boolean(editingApprovalId.value)

  panelBusy.value = true
  try {
    await saveDraft(approved, returned, isEditing)
  } finally {
    panelBusy.value = false
  }
}

async function saveDraft(approved, returned, isEditing) {
  const { error } = await supabase.rpc('save_inspection_draft', {
    p_approval_id: editingApprovalId.value || null,
    p_product_id: selectedProduct.value.id,
    p_product_name: selectedProduct.value.name,
    p_approved_qty: approved,
    p_return_qty: returned,
    p_requested_by: currentStaffName,
  })

  if (error) {
    panelError.value = error.message
    return
  }

  panelMessage.value = isEditing
    ? 'Your saved inspection was updated.'
    : 'Inspection saved. It is not submitted yet.'

  await fetchAll()

  // the window may have been closed while saving
  if (!selectedProduct.value) return

  const latestMine = approvals.value.find(item =>
    item.product_id === selectedProduct.value.id &&
    item.status === 'saved' &&
    isMyApproval(item)
  )

  if (latestMine) {
    editingApprovalId.value = latestMine.id
    approvedQty.value = Number(latestMine.approved_qty || 0)
    returnQty.value = Number(latestMine.return_qty || 0)
  }
}

async function submitSavedApproval(approval) {
  if (panelBusy.value) return

  if (!isMyApproval(approval)) {
    panelError.value = 'You can only submit your own inspection.'
    return
  }

  panelBusy.value = true
  try {
    const { error } = await supabase.rpc('submit_inspection_approval', {
      p_approval_id: approval.id,
    })

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = 'Submitted to admin approval.'
    approvedQty.value = 0
    returnQty.value = 0
    editingApprovalId.value = null

    await fetchAll()
  } finally {
    panelBusy.value = false
  }
}

async function removeSavedInspection(approval) {
  if (panelBusy.value) return

  if (!isMyApproval(approval)) {
    panelError.value = 'You can only remove your own inspection.'
    return
  }

  const confirmDelete = confirm('Remove this saved inspection?')
  if (!confirmDelete) return

  panelBusy.value = true
  try {
    const { error } = await supabase.rpc('delete_inspection_draft', {
      p_approval_id: approval.id,
    })

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = 'Saved inspection removed.'
    approvedQty.value = 0
    returnQty.value = 0
    editingApprovalId.value = null

    await fetchAll()
  } finally {
    panelBusy.value = false
  }
}

function formatDate(date) {
  if (!date) return 'No date'
  // Read "2026-10-13" as a local date, not UTC midnight (can show the day before).
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
.tab-btn {
  border-radius: 1rem;
  padding: 0.75rem 1.25rem;
  font-weight: 700;
  transition: 0.2s;
}

.tab-active {
  background: rgb(220 38 38);
  color: white;
}

.tab-inactive {
  color: rgb(161 161 170);
}

.tab-inactive:hover {
  background: rgb(39 39 42);
  color: white;
}

.inspection-input {
  width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgb(63 63 70);
  background: rgb(39 39 42);
  padding: 0.5rem 0.75rem;
  text-align: center;
  font-size: 0.875rem;
  color: white;
  outline: none;
}

.inspection-input:focus {
  border-color: rgb(239 68 68);
}
</style>