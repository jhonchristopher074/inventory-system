<template>
  <div>
    <PageHeader title="To-Do List" subtitle="Inspections and deliveries waiting to be done, most urgent first." />

    <!-- filter chips + search + add -->
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/5 bg-zinc-900 p-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
          :class="activeTab === tab.key ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'"
          :aria-pressed="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span
            class="text-xs font-semibold"
            :class="activeTab === tab.key ? 'text-white/80' : 'text-zinc-500'"
          >{{ counts[tab.key] }}</span>
          <span
            v-if="overdueCounts[tab.key]"
            class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
            :class="activeTab === tab.key ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
            title="Overdue"
          >{{ overdueCounts[tab.key] }}</span>
        </button>
      </div>

      <div class="ml-auto flex w-full items-center gap-2 sm:w-auto">
        <input
          v-model="search"
          type="search"
          placeholder="Search..."
          aria-label="Search the to-do list"
          class="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-red-500 sm:w-56 sm:flex-none"
        />

        <button
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-900/40 transition hover:bg-red-700"
          :title="activeTab === 'delivery' ? 'Schedule a delivery' : 'Schedule an inspection'"
          @click="openAddModal"
        >
          <span class="text-base leading-none">+</span>
          Add task
        </button>
      </div>
    </div>

    <p v-if="loading" class="text-sm text-zinc-400">Loading...</p>
    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400">{{ errorMessage }}</p>

    <!-- summary + colour key -->
    <div v-if="!loading && visibleItems.length > 0" class="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
      <p>
        <b class="text-white">{{ visibleItems.length }}</b> to do
        <template v-if="visibleOverdue > 0">
          · <b class="text-red-400">{{ visibleOverdue }} overdue</b>
        </template>
      </p>
      <p class="flex items-center gap-3 text-xs">
        <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-red-500"></span>Approved</span>
        <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-lime-400"></span>Saved</span>
        <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-amber-400"></span>Submitted</span>
      </p>
    </div>

    <!-- nothing to do -->
    <div
      v-if="!loading && visibleItems.length === 0"
      class="flex flex-col items-center gap-3 rounded-[24px] border border-dashed border-white/15 bg-zinc-900 px-5 py-10 text-center"
    >
      <template v-if="search.trim()">
        <p class="font-bold text-white">No task matches "{{ search.trim() }}"</p>
        <button
          type="button"
          class="rounded-2xl bg-zinc-800 px-5 py-2.5 font-bold text-white hover:bg-zinc-700"
          @click="search = ''"
        >
          Clear search
        </button>
      </template>
      <template v-else>
        <p class="font-bold text-white">All caught up</p>
        <p class="max-w-sm text-sm text-zinc-400">
          No inspections or deliveries are waiting. Add one so the staff know what comes next.
        </p>
        <button
          type="button"
          class="mt-1 rounded-2xl bg-red-600 px-5 py-2.5 font-bold text-white hover:bg-red-700"
          @click="openAddModal"
        >
          + Add task
        </button>
      </template>
    </div>

    <!-- THE LIST: Overdue, Today, This week, Later -->
    <section v-for="group in todoGroups" :key="group.key" class="mb-6">
      <h2 class="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider" :class="group.tone">
        {{ group.label }}
        <span class="rounded-full bg-white/10 px-2 py-0.5 text-[0.7rem] text-zinc-300">{{ group.items.length }}</span>
      </h2>

      <ul class="space-y-2">
        <li
          v-for="task in group.items"
          :key="task.key"
          class="rounded-2xl border p-4"
          :class="task.overdue ? 'border-red-500/50 bg-red-950/20' : 'border-white/10 bg-zinc-900'"
        >
          <div class="flex items-start gap-3">
            <!-- the empty circle of a to-do item -->
            <span
              class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2"
              :class="group.circle"
              aria-hidden="true"
            ></span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span
                  class="rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide"
                  :class="task.kind === 'inspection' ? 'bg-sky-500/15 text-sky-300' : 'bg-violet-500/15 text-violet-300'"
                >
                  {{ task.kind === 'inspection' ? 'Inspection' : 'Delivery' }}
                </span>
                <h3 class="min-w-0 break-words font-bold text-white">{{ task.title }}</h3>
              </div>

              <p class="mt-1 text-sm text-zinc-400">{{ task.sub }}</p>

              <p class="mt-1 text-sm font-bold" :class="task.overdue ? 'text-red-400' : 'text-zinc-300'">
                {{ task.when }}
                <span class="font-normal text-zinc-500">· {{ formatDate(task.date) }}</span>
              </p>

              <!-- INSPECTION: how far along it is -->
              <template v-if="task.kind === 'inspection'">
                <div class="mt-3 max-w-md">
                  <div class="flex items-center justify-between text-xs text-zinc-400">
                    <span class="font-bold text-white">{{ task.row.totalPct }}%</span>
                    <span>{{ count(task.row.remaining) }} left of {{ count(task.row.qty) }}</span>
                  </div>
                  <div class="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <span class="bg-red-500" :style="{ width: task.row.approvedPct + '%' }"></span>
                    <span class="bg-lime-400" :style="{ width: task.row.savedPct + '%' }"></span>
                    <span class="bg-amber-400" :style="{ width: task.row.submittedPct + '%' }"></span>
                  </div>
                </div>

                <p v-if="task.row.waiting > 0" class="mt-2 text-xs font-bold text-yellow-400">
                  {{ task.row.waiting }} waiting for your approval
                </p>
              </template>

              <!-- DELIVERY: receipt state, add receipt, delete -->
              <template v-else>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    v-if="receiptStateOf(task.delivery)"
                    class="rounded-full px-3 py-1 text-xs font-bold"
                    :class="receiptStateOf(task.delivery).tone"
                  >
                    {{ receiptStateOf(task.delivery).text }}
                  </span>
                  <span v-else class="text-sm text-emerald-400">{{ task.delivery.status || 'Scheduled' }}</span>
                </div>

                <!-- arrived without its receipt: no stock until it's in -->
                <template v-if="task.delivery.receipt_state === 'waiting'">
                  <p class="mt-3 text-xs text-amber-200/80">
                    No stock is added until its receipt is in. When the supplier sends it, link it in Approval, or upload it here.
                  </p>
                  <RouterLink
                    :to="{ path: '/approval', query: { receiptFor: task.delivery.id } }"
                    class="mt-3 inline-block rounded-xl bg-amber-500 px-4 py-2 text-center text-sm font-bold text-black hover:bg-amber-400"
                  >
                    Add receipt
                  </RouterLink>
                </template>
                <p v-else-if="task.delivery.receipt_state === 'sent'" class="mt-3 text-xs text-zinc-500">
                  Its receipt <b class="text-zinc-300">{{ task.delivery.receipt_file }}</b> is in Approval.
                </p>

                <!-- delete (not once a receipt is linked to it): asks first, here -->
                <template v-if="!task.delivery.upload_id">
                  <div v-if="deletingId === task.delivery.id" class="mt-3 max-w-sm rounded-xl border border-red-500/40 bg-red-600/10 p-3">
                    <p class="text-sm font-bold text-red-200">Delete this delivery?</p>
                    <p class="mt-0.5 text-xs text-zinc-400">It leaves the list and the staff are told.</p>
                    <p v-if="deleteError" class="mt-2 text-xs text-red-300" role="alert">{{ deleteError }}</p>
                    <div class="mt-3 flex gap-2">
                      <button
                        type="button"
                        class="flex-1 rounded-lg bg-zinc-800 py-2 text-sm font-bold text-white hover:bg-zinc-700"
                        :disabled="deleteBusy"
                        @click="deletingId = null"
                      >
                        Keep
                      </button>
                      <button
                        type="button"
                        class="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        :disabled="deleteBusy"
                        @click="deleteDelivery(task.delivery)"
                      >
                        {{ deleteBusy ? 'Deleting…' : 'Yes, delete' }}
                      </button>
                    </div>
                  </div>
                  <button
                    v-else
                    type="button"
                    class="mt-3 rounded-xl border border-white/10 px-4 py-1.5 text-sm font-bold text-zinc-300 transition hover:border-red-500/50 hover:bg-red-600/10 hover:text-red-300"
                    :title="'Delete ' + task.title"
                    @click="askDelete(task.delivery)"
                  >
                    Delete
                  </button>
                </template>
              </template>
            </div>

            <button
              v-if="task.kind === 'inspection'"
              type="button"
              class="shrink-0 rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              @click="openPanel(task.row.item)"
            >
              Details
            </button>
          </div>
        </li>
      </ul>
    </section>

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
              <!-- today or later: a schedule in the past would be overdue at once -->
              <input v-model="newSchedule.date" type="date" :min="getToday()" class="calendar-date-input" />
            </div>
          </div>

          <div v-if="newSchedule.type === 'delivery'" class="space-y-4">
            <div>
              <label class="label">Delivery Title</label>
              <input
                v-model="newSchedule.title"
                type="text"
                placeholder="What's being delivered, e.g. 50 bags of cement"
                class="input"
              />
            </div>

            <div>
              <label class="label">Supplier</label>
              <input
                v-model="newSchedule.supplier"
                type="text"
                placeholder="Who delivers it, e.g. JM Supply"
                class="input"
              />
            </div>

            <div>
              <label class="label">Delivery Date</label>
              <input v-model="newSchedule.date" type="date" :min="getToday()" class="calendar-date-input" />
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
              batch of {{ count(inspectionQty(selectedProduct)) }}
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
            Approved: {{ count(selectedProduct.approved_count) }}
          </span>
          <span class="rounded-full bg-red-600/20 px-3 py-1 text-red-400">
            Return: {{ count(selectedProduct.return_count) }}
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
              Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
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
              Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
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
import { refreshTasksSoon, taskBadges } from '../../lib/taskCounts'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'
import { count } from '../../lib/format'
import { isDelivered, isOpenDelivery, receiptStateOf } from '../../lib/deliveries'
import { RouterLink } from 'vue-router'
import { useQueryParam } from '../../lib/useQueryParam'
import { toast } from '../../lib/toast'

// in the address (?tab=delivery), like the Staff calendar, so the Dashboard
// can open the Delivery tab
const activeTab = useQueryParam('tab', 'all', ['all', 'inspection', 'delivery'])

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'delivery', label: 'Delivery' },
]

const search = ref('')

const products = ref([])
const allProducts = ref([])
const deliveries = ref([])
const approvals = ref([])

// a schedule added or changed here: the menu's numbers follow
watch([products, deliveries, approvals], () => refreshTasksSoon())

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

/* ------------------------------------------------------------------
   To-do list: inspections and deliveries as one list, most urgent first
------------------------------------------------------------------ */
// whole days from today to a YYYY-MM-DD date (negative = in the past)
function dayDiff(date) {
  if (!date) return null

  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = getToday().split('-').map(Number)

  return Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000)
}

function whenLabel(task, diff) {
  if (diff === null) return 'No date'

  if (task.overdue) return diff === -1 ? '1 day overdue' : `${-diff} days overdue`
  if (diff < 0) return 'Arrived'
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'

  return `In ${diff} days`
}

function bucketOf(task, diff) {
  if (task.overdue) return 'overdue'
  if (diff === null) return 'later'
  if (diff <= 0) return 'today'
  if (diff <= 7) return 'week'
  return 'later'
}

const todoItems = computed(() => {
  const list = []

  for (const row of inspectionRows.value) {
    list.push({
      key: 'i' + row.item.id,
      kind: 'inspection',
      title: row.item.name,
      sub: `${row.item.category || 'Uncategorized'} · batch of ${count(row.qty)}`,
      date: row.date ? String(row.date).slice(0, 10) : '',
      overdue: row.overdue,
      row,
    })
  }

  for (const delivery of deliveries.value) {
    list.push({
      key: 'd' + delivery.id,
      kind: 'delivery',
      title: delivery.title,
      sub: `Supplier: ${delivery.supplier || 'No supplier'}`,
      date: delivery.delivery_date ? String(delivery.delivery_date).slice(0, 10) : '',
      overdue: isDeliveryOverdue(delivery),
      delivery,
    })
  }

  for (const task of list) {
    const diff = dayDiff(task.date)
    task.bucket = bucketOf(task, diff)
    task.when = whenLabel(task, diff)
  }

  // earliest date first; tasks without a date go last
  return list.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date.localeCompare(b.date)
  })
})

const counts = computed(() => ({
  all: todoItems.value.length,
  inspection: todoItems.value.filter((task) => task.kind === 'inspection').length,
  delivery: todoItems.value.filter((task) => task.kind === 'delivery').length,
}))

const overdueCounts = computed(() => ({
  all: todoItems.value.filter((task) => task.overdue).length,
  inspection: todoItems.value.filter((task) => task.overdue && task.kind === 'inspection').length,
  delivery: todoItems.value.filter((task) => task.overdue && task.kind === 'delivery').length,
}))

// what the chip and the search box leave
const visibleItems = computed(() => {
  const text = search.value.toLowerCase().trim()

  return todoItems.value.filter((task) => {
    if (activeTab.value !== 'all' && task.kind !== activeTab.value) return false
    if (!text) return true

    return `${task.title} ${task.sub}`.toLowerCase().includes(text)
  })
})

const visibleOverdue = computed(() => visibleItems.value.filter((task) => task.overdue).length)

const GROUPS = [
  { key: 'overdue', label: 'Overdue', tone: 'text-red-400', circle: 'border-red-500' },
  { key: 'today', label: 'Today', tone: 'text-amber-300', circle: 'border-amber-400' },
  { key: 'week', label: 'This week', tone: 'text-zinc-300', circle: 'border-zinc-400' },
  { key: 'later', label: 'Later', tone: 'text-zinc-400', circle: 'border-zinc-600' },
]

const todoGroups = computed(() =>
  GROUPS
    .map((group) => ({ ...group, items: visibleItems.value.filter((task) => task.bucket === group.key) }))
    .filter((group) => group.items.length > 0)
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
// late: its date passed and the goods haven't come
function isDeliveryOverdue(delivery) {
  if (!delivery.delivery_date || isDelivered(delivery)) return false
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
    // done ones leave; arrived ones stay until their receipt is through
    deliveries.value = (data || []).filter(isOpenDelivery)
  }
}

// ----- Delete a delivery (asks first, on its card) -----
const deletingId = ref(null)
const deleteBusy = ref(false)
const deleteError = ref('')

function askDelete(delivery) {
  deleteError.value = ''
  deletingId.value = delivery.id
}

async function deleteDelivery(delivery) {
  if (deleteBusy.value) return
  deleteBusy.value = true
  deleteError.value = ''

  const { error } = await supabase.rpc('admin_delete_delivery', { p_delivery_id: delivery.id })

  deleteBusy.value = false
  if (error) {
    deleteError.value = /admin_delete_delivery|schema cache/i.test(error.message)
      ? 'Deleting isn\'t set up yet: run 20261110000001_delete_delivery.sql in Supabase.'
      : error.message
    return
  }

  deletingId.value = null
  deliveries.value = deliveries.value.filter((item) => item.id !== delivery.id)
  toast(`Deleted "${delivery.title}".`)
  refreshTasksSoon()
  fetchDeliveries()
}

function openAddModal() {
  newSchedule.value = {
    type: activeTab.value === 'delivery' ? 'delivery' : 'inspection',
    product_id: '',
    title: '',
    supplier: '',
    // starts at today
    date: getToday(),
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

  // typed in by hand: the picker alone doesn't stop it
  if (newSchedule.value.date < getToday()) {
    modalError.value = "Pick today or a later date: that day has already passed."
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