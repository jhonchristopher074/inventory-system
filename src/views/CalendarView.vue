<template>
  <div>
    <PageHeader
      title="Calendar"
      subtitle="Products scheduled for inspection. Past inspections stay visible until all items are inspected."
    />

    <p v-if="loading" class="text-sm text-zinc-400">Loading...</p>

    <p v-if="errorMessage" class="mb-3 rounded-lg bg-red-600/20 p-3 text-sm text-red-400">
      {{ errorMessage }}
    </p>

    <div
      v-if="!loading && groupedInspectionDates.length === 0"
      class="rounded-xl border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400"
    >
      No inspection schedules.
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="group in groupedInspectionDates"
        :key="group.date"
        class="rounded-2xl border border-white/10 bg-zinc-900 p-3"
      >
        <div class="mb-3">
          <h2 class="text-lg font-bold text-white">
            {{ formatDate(group.date) }}
          </h2>

          <p class="text-[11px] text-zinc-400">
            {{ group.items.length }} product(s)
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="flex flex-col justify-between rounded-xl border border-white/10 bg-black p-3"
            :class="
              isOverdue(item)
                ? 'border-red-500/70 bg-red-950/30 shadow-lg shadow-red-500/20'
                : ''
            "
          >
            <div>
              <p class="text-sm font-bold text-white">{{ item.name }}</p>
              <p class="text-[11px] text-red-400">{{ item.category }}</p>

              <p class="mt-1 text-[11px] text-zinc-300">
                Qty: {{ item.quantity }}
              </p>

              <p class="mt-1 text-[11px] text-zinc-300">
                Current Inspected:
                {{ currentInspected(item) }} / {{ item.quantity }}
              </p>

              <p class="mt-1 text-[11px] font-bold text-yellow-400">
                Remaining: {{ remainingItems(item) }}
              </p>

              <div class="mt-2">
                <div class="mb-1 flex items-center justify-between">
                  <span class="text-[10px] text-zinc-400">Progress</span>
                  <span class="text-[10px] font-bold text-white">
                    {{ inspectionPercent(item) }}%
                  </span>
                </div>

                <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    class="h-full rounded-full bg-red-600 transition-all duration-300"
                    :style="{ width: inspectionPercent(item) + '%' }"
                  ></div>
                </div>
              </div>

              <span
                v-if="isOverdue(item)"
                class="mt-2 inline-block rounded-full bg-red-600/20 px-2 py-[1px] text-[10px] font-bold text-red-400"
              >
                Overdue / Unfinished
              </span>

              <div class="mt-2 flex flex-wrap gap-1">
                <span class="rounded-full bg-emerald-600/20 px-2 py-[1px] text-[10px] font-bold text-emerald-400">
                  Approved: {{ item.approved_count || 0 }}
                </span>

                <span class="rounded-full bg-red-600/20 px-2 py-[1px] text-[10px] font-bold text-red-400">
                  Return: {{ item.return_count || 0 }}
                </span>
              </div>
            </div>

            <button
              class="mt-2 w-full rounded-lg bg-red-600 py-2 text-[11px] font-bold text-white hover:bg-red-500"
              @click="openPanel(item)"
            >
              Open Product
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- INSPECTION PANEL -->
    <div
      v-if="selectedProduct"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closePanel"
    >
      <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-4">
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

        <p class="mb-4 text-sm text-zinc-300">
          <b>Date:</b> {{ formatDate(selectedProduct.inspection_date) }}
        </p>

        <div class="mb-3 rounded-xl border border-white/10 bg-black p-3">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs text-zinc-400">Inspection Progress</span>
            <span class="text-xs font-bold text-white">
              {{ modalPercent }}%
            </span>
          </div>

          <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div
              class="h-full rounded-full bg-red-600 transition-all duration-300"
              :style="{ width: modalPercent + '%' }"
            ></div>
          </div>

          <p class="mt-2 text-xs text-zinc-400">
            Remaining: {{ modalRemaining }}
          </p>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-4">
          <div>
            <label class="mb-1 block text-xs text-zinc-300">Approved</label>
            <input
              v-model.number="approvedCount"
              type="number"
              min="0"
              :max="maxApproved"
              class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-sm text-white outline-none focus:border-red-500"
              @input="limitApproved"
            />
            <p class="mt-1 text-[10px] text-zinc-500">
              Max: {{ maxApproved }}
            </p>
          </div>

          <div>
            <label class="mb-1 block text-xs text-zinc-300">Return</label>
            <input
              v-model.number="returnCount"
              type="number"
              min="0"
              :max="maxReturn"
              class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-sm text-white outline-none focus:border-red-500"
              @input="limitReturn"
            />
            <p class="mt-1 text-[10px] text-zinc-500">
              Max: {{ maxReturn }}
            </p>
          </div>
        </div>

        <p
          class="mb-2 text-xs"
          :class="totalInputCount > selectedProduct.quantity ? 'text-red-400' : 'text-zinc-400'"
        >
          Total inspected: {{ totalInputCount }} / {{ selectedProduct.quantity }}
        </p>

        <p v-if="panelError" class="mb-3 rounded-lg bg-red-600/20 p-2 text-xs text-red-400">
          {{ panelError }}
        </p>

        <div class="flex flex-col gap-2">
          <button
            class="w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700"
            @click="confirmInspection"
          >
            Save Inspection Result
          </button>

          <button
            class="w-full rounded-lg bg-yellow-600 py-2 text-sm font-semibold text-white hover:bg-yellow-700"
            @click="cancelInspection"
          >
            Cancel Inspection
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
import { supabase } from '../lib/supabase'
import PageHeader from '../components/PageHeader.vue'

const products = ref([])
const loading = ref(false)
const errorMessage = ref('')

const selectedProduct = ref(null)
const approvedCount = ref(0)
const returnCount = ref(0)
const panelError = ref('')

const totalInputCount = computed(() => {
  return Number(approvedCount.value || 0) + Number(returnCount.value || 0)
})

const modalRemaining = computed(() => {
  if (!selectedProduct.value) return 0

  const quantity = Number(selectedProduct.value.quantity || 0)
  return Math.max(quantity - totalInputCount.value, 0)
})

const modalPercent = computed(() => {
  if (!selectedProduct.value) return 0

  const quantity = Number(selectedProduct.value.quantity || 0)
  if (quantity <= 0) return 0

  return Math.min(Math.round((totalInputCount.value / quantity) * 100), 100)
})

const maxApproved = computed(() => {
  if (!selectedProduct.value) return 0

  const quantity = Number(selectedProduct.value.quantity || 0)
  const returned = Number(returnCount.value || 0)

  return Math.max(quantity - returned, 0)
})

const maxReturn = computed(() => {
  if (!selectedProduct.value) return 0

  const quantity = Number(selectedProduct.value.quantity || 0)
  const approved = Number(approvedCount.value || 0)

  return Math.max(quantity - approved, 0)
})

const groupedInspectionDates = computed(() => {
  const grouped = {}

  products.value.forEach((product) => {
    if (!product.inspection_date) return

    if (!grouped[product.inspection_date]) {
      grouped[product.inspection_date] = []
    }

    grouped[product.inspection_date].push(product)
  })

  return Object.keys(grouped)
    .sort((a, b) => new Date(a) - new Date(b))
    .map((date) => ({
      date,
      items: grouped[date],
    }))
})

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function currentInspected(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

function remainingItems(product) {
  const quantity = Number(product.quantity || 0)
  return Math.max(quantity - currentInspected(product), 0)
}

function inspectionPercent(product) {
  const quantity = Number(product.quantity || 0)
  if (quantity <= 0) return 0

  return Math.min(Math.round((currentInspected(product) / quantity) * 100), 100)
}

function isOverdue(product) {
  const inspected = currentInspected(product)
  const quantity = Number(product.quantity || 0)

  return product.inspection_date < getToday() && inspected < quantity
}

function shouldShowInCalendar(product, today) {
  const inspected = currentInspected(product)
  const quantity = Number(product.quantity || 0)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && inspected < quantity

  return isTodayOrFuture || isPastButUnfinished
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const today = getToday()

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .not('inspection_date', 'is', null)
    .order('inspection_date', { ascending: true })

  if (error) {
    errorMessage.value = error.message
  } else {
    const visibleProducts = (data || []).filter((product) =>
      shouldShowInCalendar(product, today)
    )

    products.value = visibleProducts
    await createOverdueNotifications(visibleProducts)
  }

  loading.value = false
}

async function createOverdueNotifications(items) {
  for (const item of items) {
    if (!isOverdue(item)) continue

    const inspected = currentInspected(item)
    const quantity = Number(item.quantity || 0)

    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('product_id', item.id)
      .eq('type', 'overdue')
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from('notifications').insert({
        title: 'Overdue Inspection',
        message: `${item.name} inspection is overdue. Inspected ${inspected} out of ${quantity}.`,
        type: 'overdue',
        product_id: item.id,
      })
    }
  }
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function openPanel(product) {
  selectedProduct.value = product
  approvedCount.value = Number(product.approved_count || 0)
  returnCount.value = Number(product.return_count || 0)
  panelError.value = ''

  limitApproved()
  limitReturn()
}

function closePanel() {
  selectedProduct.value = null
  approvedCount.value = 0
  returnCount.value = 0
  panelError.value = ''
}

function limitApproved() {
  if (!selectedProduct.value) return

  const quantity = Number(selectedProduct.value.quantity || 0)
  let approved = Number(approvedCount.value || 0)
  let returned = Number(returnCount.value || 0)

  if (approved < 0) approved = 0
  if (returned < 0) returned = 0

  if (approved > quantity) approved = quantity

  if (approved + returned > quantity) {
    approved = quantity - returned
  }

  approvedCount.value = Math.max(approved, 0)
  returnCount.value = Math.max(returned, 0)
  panelError.value = ''
}

function limitReturn() {
  if (!selectedProduct.value) return

  const quantity = Number(selectedProduct.value.quantity || 0)
  let approved = Number(approvedCount.value || 0)
  let returned = Number(returnCount.value || 0)

  if (approved < 0) approved = 0
  if (returned < 0) returned = 0

  if (returned > quantity) returned = quantity

  if (approved + returned > quantity) {
    returned = quantity - approved
  }

  approvedCount.value = Math.max(approved, 0)
  returnCount.value = Math.max(returned, 0)
  panelError.value = ''
}

async function confirmInspection() {
  if (!selectedProduct.value) return

  limitApproved()
  limitReturn()

  const approved = Number(approvedCount.value || 0)
  const returned = Number(returnCount.value || 0)
  const quantity = Number(selectedProduct.value.quantity || 0)
  const total = approved + returned

  if (total > quantity) {
    panelError.value = `Invalid input. Approved + Return cannot exceed quantity (${quantity}).`
    return
  }

  const product = selectedProduct.value
  const inspectionStatus = returned > 0 ? 'return' : 'approved'

  const { error: updateError } = await supabase
    .from('products')
    .update({
      approved_count: approved,
      return_count: returned,
      inspection_result: inspectionStatus,
    })
    .eq('id', product.id)

  if (updateError) {
    panelError.value = updateError.message
    return
  }

  const { error: docError } = await supabase
    .from('documentations')
    .insert({
      title: `Inspection Result - ${product.name}`,
      type: 'Inspection Document',
      description: `${product.name} inspected on ${formatDate(
        product.inspection_date
      )}. Quantity: ${quantity}. Approved Products: ${approved}. Return Products: ${returned}.`,
      receipt_image_url:
        product.image_url ||
        'https://via.placeholder.com/600x400?text=Inspection+Document',
      product_id: product.id,
    })

  if (docError) {
    panelError.value = docError.message
    return
  }

  if (returned > 0) {
    await supabase.from('notifications').insert({
      title: 'Return Alert',
      message: `${product.name} has ${returned} returned item(s).`,
      type: 'return',
      product_id: product.id,
    })
  } else {
    await supabase.from('notifications').insert({
      title: 'Inspection Completed',
      message: `${product.name} inspection was completed successfully.`,
      type: 'inspection',
      product_id: product.id,
    })
  }

  if (quantity <= 10) {
    await supabase.from('notifications').insert({
      title: 'Low Stock Alert',
      message: `${product.name} has only ${quantity} stock(s) remaining.`,
      type: 'low_stock',
      product_id: product.id,
    })
  }

  await fetchProducts()
  closePanel()
}

async function cancelInspection() {
  if (!selectedProduct.value) return

  const { error } = await supabase
    .from('products')
    .update({
      inspection_date: null,
      inspection_result: null,
      approved_count: 0,
      return_count: 0,
    })
    .eq('id', selectedProduct.value.id)

  if (error) {
    panelError.value = error.message
    return
  }

  await fetchProducts()
  closePanel()
}

onMounted(fetchProducts)
</script>