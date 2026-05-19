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

    <p v-if="loading" class="text-sm text-zinc-400">Loading...</p>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">
      {{ errorMessage }}
    </p>

    <!-- INSPECTION -->
    <div v-if="activeTab === 'inspection'" class="space-y-5">
      <div
        v-if="!loading && groupedInspectionDates.length === 0"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 text-zinc-400"
      >
        No inspection schedules.
      </div>

      <div
        v-for="group in groupedInspectionDates"
        :key="group.date"
        class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
      >
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-white">
            {{ formatDate(group.date) }}
          </h2>
          <p class="text-sm text-zinc-400">
            {{ group.items.length }} product(s)
          </p>
        </div>

        <div class="grid grid-cols-[repeat(auto-fill,220px)] gap-5">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="flex min-h-[390px] flex-col justify-between rounded-[22px] border border-white/10 bg-black p-4 shadow-xl"
          >
            <div>
              <h3 class="text-xl font-bold text-white">
                {{ item.name }}
              </h3>

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
                Remaining: {{ remainingInspectable(item) }}
              </p>

              <!-- ONE PROGRESS BAR -->
              <div class="mt-3">
                <div class="mb-1 flex justify-between text-xs">
                  <span class="text-zinc-400">Inspection Progress</span>
                  <span class="font-bold text-white">
                    {{ totalProgressPercent(item) }}%
                  </span>
                </div>

                <div class="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <!-- APPROVED BY ADMIN -->
                  <div
                    class="h-full bg-red-600 transition-all"
                    :style="{ width: approvedPercentByProduct(item) + '%' }"
                  ></div>

                  <!-- SAVED BUT NOT SUBMITTED -->
                  <div
                    class="h-full bg-lime-400 transition-all"
                    :style="{ width: savedPercentByProduct(item) + '%' }"
                  ></div>

                  <!-- SUBMITTED TO ADMIN -->
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
          <h2 class="text-xl font-bold text-white">
            {{ delivery.title }}
          </h2>

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

    <!-- MODAL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
    >
      <div class="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-5">
        <h2 class="mb-3 text-2xl font-bold text-white">
          Approval Inspection
        </h2>

        <p class="text-sm text-zinc-300">
          <b>Product:</b> {{ selectedProduct.name }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Category:</b> {{ selectedProduct.category || 'Uncategorized' }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Quantity:</b> {{ selectedProduct.quantity }}
        </p>

        <p class="text-sm text-zinc-300">
          <b>Admin Approved:</b> {{ adminApprovedQty(selectedProduct) }}
        </p>

        <p class="text-sm text-lime-400">
          <b>Saved Not Submitted:</b> {{ savedQty(selectedProduct) }}
        </p>

        <p class="text-sm text-yellow-400">
          <b>Submitted to Admin:</b> {{ submittedQty(selectedProduct) }}
        </p>

        <p class="mb-4 text-sm font-bold text-yellow-400">
          <b>Remaining:</b> {{ remainingInspectable(selectedProduct) }}
        </p>

        <!-- MODAL PROGRESS -->
        <div class="mb-4 rounded-xl border border-white/10 bg-black p-3">
          <div class="mb-1 flex justify-between text-xs">
            <span class="text-zinc-400">Inspection Progress</span>
            <span class="font-bold text-white">
              {{ liveTotalProgressPercent }}%
            </span>
          </div>

          <div class="flex h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              class="h-full bg-red-600 transition-all duration-300"
              :style="{ width: approvedSegmentPercent + '%' }"
            ></div>

            <div
              class="h-full bg-lime-400 transition-all duration-300"
              :style="{ width: savedSegmentPercent + '%' }"
            ></div>

            <div
              class="h-full bg-yellow-400 transition-all duration-300"
              :style="{ width: submittedSegmentPercent + '%' }"
            ></div>
          </div>

          <div class="mt-2 flex flex-wrap gap-3 text-[11px]">
            <span class="text-red-400">Red: Approved</span>
            <span class="text-lime-400">Green: Saved</span>
            <span class="text-yellow-400">Yellow: Submitted</span>
          </div>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-xs text-zinc-300">
              Approved Qty
            </label>

            <input
              v-model.number="approvedQty"
              type="number"
              min="0"
              :max="maxApprovedInput"
              class="inspection-input"
              @input="limitApproved"
            />

            <p class="mt-1 text-[10px] text-zinc-500">
              Max: {{ maxApprovedInput }}
            </p>
          </div>

          <div>
            <label class="mb-1 block text-xs text-zinc-300">
              Return Qty
            </label>

            <input
              v-model.number="returnQty"
              type="number"
              min="0"
              :max="maxReturnInput"
              class="inspection-input"
              @input="limitReturn"
            />

            <p class="mt-1 text-[10px] text-zinc-500">
              Max: {{ maxReturnInput }}
            </p>
          </div>
        </div>

        <p class="mb-2 text-xs text-zinc-400">
          Total current input:
          {{ liveInputQty }} / {{ availableForEditing }}
        </p>

        <!-- SAVED INSPECTIONS -->
        <div
          v-if="selectedProductSavedList.length > 0"
          class="mb-4 rounded-xl border border-lime-500/20 bg-lime-500/10 p-3"
        >
          <h3 class="mb-2 text-sm font-bold text-lime-400">
            Saved Inspections Not Submitted
          </h3>

          <div
            v-for="approval in selectedProductSavedList"
            :key="approval.id"
            class="mb-2 rounded-lg bg-black p-3"
          >
            <p class="text-sm text-white">
              Approved: {{ approval.approved_qty }} |
              Return: {{ approval.return_qty }}
            </p>

            <p class="text-xs text-zinc-400">
              Total:
              {{ Number(approval.approved_qty || 0) + Number(approval.return_qty || 0) }}
              <span v-if="approval.requested_by">
                • {{ approval.requested_by }}
              </span>
            </p>

            <div v-if="isMyApproval(approval)" class="mt-2 flex gap-2">
              <button
                class="flex-1 rounded-lg bg-yellow-500 py-2 text-xs font-bold text-black hover:bg-yellow-400"
                @click="submitSavedApproval(approval)"
              >
                Submit
              </button>

              <button
                class="flex-1 rounded-lg bg-red-600 py-2 text-xs font-bold text-white hover:bg-red-700"
                @click="removeSavedInspection(approval)"
              >
                Remove
              </button>
            </div>

            <p v-else class="mt-2 rounded-lg bg-zinc-800 p-2 text-xs text-zinc-400">
              Other staff inspection. Read-only.
            </p>
          </div>
        </div>

        <!-- SUBMITTED INSPECTIONS -->
        <div
          v-if="selectedProductSubmittedList.length > 0"
          class="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3"
        >
          <h3 class="mb-2 text-sm font-bold text-yellow-400">
            Submitted to Admin
          </h3>

          <div
            v-for="approval in selectedProductSubmittedList"
            :key="approval.id"
            class="mb-2 rounded-lg bg-black p-3"
          >
            <p class="text-sm text-white">
              Approved: {{ approval.approved_qty }} |
              Return: {{ approval.return_qty }}
            </p>

            <p class="text-xs text-zinc-400">
              Total:
              {{ Number(approval.approved_qty || 0) + Number(approval.return_qty || 0) }}
              <span v-if="approval.requested_by">
                • {{ approval.requested_by }}
              </span>
            </p>

            <p class="mt-2 rounded-lg bg-zinc-800 p-2 text-xs text-zinc-400">
              Waiting for admin approval.
            </p>
          </div>
        </div>

        <p
          v-if="panelMessage"
          class="mb-3 rounded-lg bg-emerald-600/20 p-2 text-xs text-emerald-400"
        >
          {{ panelMessage }}
        </p>

        <p
          v-if="panelError"
          class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400"
        >
          {{ panelError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
            @click="saveInspection"
          >
            {{ editingApprovalId ? 'Update My Saved Inspection' : 'Save Inspection' }}
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
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

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

const groupedInspectionDates = computed(() => {
  const grouped = {}

  inspections.value.forEach(product => {
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

  return percent(adminApprovedQty(selectedProduct.value), selectedProduct.value.quantity)
})

const savedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0

  const liveSaved =
    savedQty(selectedProduct.value) -
    oldEditingQty.value +
    liveInputQty.value

  return percent(liveSaved, selectedProduct.value.quantity)
})

const submittedSegmentPercent = computed(() => {
  if (!selectedProduct.value) return 0

  return percent(submittedQty(selectedProduct.value), selectedProduct.value.quantity)
})

const liveTotalProgressPercent = computed(() => {
  return Math.min(
    approvedSegmentPercent.value +
    savedSegmentPercent.value +
    submittedSegmentPercent.value,
    100
  )
})

onMounted(async () => {
  await fetchAll()
})

async function fetchAll() {
  await fetchInspections()
  await fetchApprovals()
  await fetchDeliveries()
}

async function fetchInspections() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .not('inspection_date', 'is', null)
    .order('inspection_date', { ascending: true })

  if (error) {
    errorMessage.value = error.message
    inspections.value = []
  } else {
    inspections.value = data || []
  }

  loading.value = false
}

async function fetchApprovals() {
  const { data, error } = await supabase
    .from('inspection_approvals')
    .select('*')
    .in('status', ['saved', 'submitted'])
    .order('created_at', { ascending: false })

  if (!error) {
    approvals.value = data || []
  }
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

function productApprovals(product, status) {
  return approvals.value.filter(item => {
    return item.product_id === product.id && item.status === status
  })
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

function remainingInspectable(product) {
  const quantity = Number(product.quantity || 0)

  return Math.max(
    quantity -
      adminApprovedQty(product) -
      savedQty(product) -
      submittedQty(product),
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

function isMyApproval(approval) {
  return approval.requested_by === currentStaffName
}

function openPanel(product) {
  selectedProduct.value = product
  panelError.value = ''
  panelMessage.value = ''

  const mine = approvals.value.find(item => {
    return (
      item.product_id === product.id &&
      item.status === 'saved' &&
      item.requested_by === currentStaffName
    )
  })

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

async function saveInspection() {
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

  if (editingApprovalId.value) {
    const { error } = await supabase
      .from('inspection_approvals')
      .update({
        approved_qty: approved,
        return_qty: returned,
        requested_by: currentStaffName,
        status: 'saved',
      })
      .eq('id', editingApprovalId.value)

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = 'Your saved inspection was updated.'
  } else {
    const { error } = await supabase
      .from('inspection_approvals')
      .insert({
        product_id: selectedProduct.value.id,
        product_name: selectedProduct.value.name,
        approved_qty: approved,
        return_qty: returned,
        status: 'saved',
        requested_by: currentStaffName,
      })

    if (error) {
      panelError.value = error.message
      return
    }

    panelMessage.value = 'Inspection saved. It is not submitted yet.'
  }

  await fetchAll()

  const latestMine = approvals.value.find(item => {
    return (
      item.product_id === selectedProduct.value.id &&
      item.status === 'saved' &&
      item.requested_by === currentStaffName
    )
  })

  if (latestMine) {
    editingApprovalId.value = latestMine.id
    approvedQty.value = Number(latestMine.approved_qty || 0)
    returnQty.value = Number(latestMine.return_qty || 0)
  }
}

async function submitSavedApproval(approval) {
  if (!isMyApproval(approval)) {
    panelError.value = 'You can only submit your own inspection.'
    return
  }

  const { error: updateError } = await supabase
    .from('inspection_approvals')
    .update({
      status: 'submitted',
    })
    .eq('id', approval.id)

  if (updateError) {
    panelError.value = updateError.message
    return
  }

  const total =
    Number(approval.approved_qty || 0) +
    Number(approval.return_qty || 0)

  const { error: notifError } = await supabase.from('notifications').insert({
    title: 'Inspection Approval Request',
    message: `${approval.product_name} has ${total} item(s) waiting for admin approval.`,
    type: 'inspection_approval',
    product_id: approval.product_id,
    is_read: false,
  })

  if (notifError) {
    panelError.value = notifError.message
    return
  }

  panelMessage.value = 'Submitted to admin approval.'
  approvedQty.value = 0
  returnQty.value = 0
  editingApprovalId.value = null

  await fetchAll()
}

async function removeSavedInspection(approval) {
  if (!isMyApproval(approval)) {
    panelError.value = 'You can only remove your own inspection.'
    return
  }

  const confirmDelete = confirm('Remove this saved inspection?')
  if (!confirmDelete) return

  const { error } = await supabase
    .from('inspection_approvals')
    .delete()
    .eq('id', approval.id)

  if (error) {
    panelError.value = error.message
    return
  }

  panelMessage.value = 'Saved inspection removed.'

  approvedQty.value = 0
  returnQty.value = 0
  editingApprovalId.value = null

  await fetchAll()
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