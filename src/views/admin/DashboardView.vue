<template>
  <!-- @container: the layout follows the width of the page area (the
       sidebar takes part of the window), not the whole window -->
  <div class="@container">
    <DashboardHero
      tone="red"
      icon="dashboard"
      role="Owner"
      place="Store overview"
      subtitle="Sales, stock and approvals for the whole store."
      :now="now"
    >
      <div class="flex items-center gap-3">
        <span v-if="updatedAt" class="text-xs text-zinc-500">Updated {{ updatedText }}</span>
        <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-zinc-200 hover:border-red-500/40 hover:text-white disabled:opacity-60"
          :disabled="refreshing"
          @click="load"
        >
          <NavIcon name="refresh" class="h-4 w-4" :class="{ 'animate-spin': refreshing }" />
          {{ refreshing ? 'Refreshing…' : 'Refresh' }}
        </button>
      </div>
    </DashboardHero>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
      {{ errorMessage }}
    </p>

    <!-- while refreshing, the numbers stay where they are (dimmed) instead
         of disappearing and jumping back -->
    <div class="transition-opacity" :class="{ 'opacity-60': refreshing && loaded }">
      <!-- ============================================================
           AT A GLANCE: today's sales is the big number. Low stock and
           Overdue turn alert orange with a caution sign, and name what it is,
           when something needs action.
      ============================================================ -->
      <section class="mb-5 grid grid-cols-2 gap-3 @min-[900px]:grid-cols-5" aria-label="At a glance">
        <RouterLink to="/admin/sales" class="kpi tone-red col-span-2">
          <div class="kpi-top">
            <p class="kpi-label">Sales today</p>
            <span class="kpi-icon"><NavIcon name="sales" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-hero">{{ loaded ? peso(today.total) : '—' }}</p>

          <p class="kpi-sub">
            <template v-if="today.count > 0">
              {{ salesText(today.count) }} · {{ count(today.items) }} item{{ today.items === 1 ? '' : 's' }} sold
            </template>
            <template v-else-if="loaded">No sales yet today</template>
          </p>

          <!-- today so far against yesterday up to the same time -->
          <p v-if="todayChange" class="kpi-change" :class="todayChange.tone">
            <NavIcon v-if="todayChange.icon" :name="todayChange.icon" class="h-3.5 w-3.5 shrink-0" />
            {{ todayChange.text }}
          </p>
        </RouterLink>

        <RouterLink to="/admin/sales" class="kpi tone-green col-span-2 @min-[900px]:col-span-1">
          <div class="kpi-top">
            <p class="kpi-label">Sales this month</p>
            <span class="kpi-icon"><NavIcon name="pos" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value" :title="peso(month.total)">{{ loaded ? pesoTile(month.total) : '—' }}</p>
          <p class="kpi-sub">{{ salesText(month.count) }} in {{ monthName }}</p>
        </RouterLink>

        <AlertTile
          :to="LOW_STOCK_LINK"
          label="Low stock"
          :value="loaded ? lowStock.length : null"
          :sub="lowStock.length > 0 || !loaded ? `of ${count(products.length)} products` : 'Every product has enough'"
          :alert="lowStock.length > 0"
        >
          <p v-if="outOfStock.length > 0" class="kpi-change text-red-400">
            {{ count(outOfStock.length) }} out of stock
          </p>
        </AlertTile>

        <AlertTile
          :to="overdueLink"
          label="Overdue"
          :value="loaded ? overdueCount : null"
          :sub="overdueText"
          :alert="overdueCount > 0"
        />
      </section>

      <!-- ============================================================
           SALES OF THE WEEK + WHAT NEEDS ATTENTION
      ============================================================ -->
      <section class="mb-5 grid gap-5 @min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <!-- the chart grows to the height of the to-do card beside it -->
        <div class="card flex flex-col p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow tone-red">Sales</p>
              <h2 class="card-title">Last 7 days</h2>
            </div>

            <div class="text-right">
              <p class="text-xl font-extrabold text-white">{{ peso(weekTotal) }}</p>
              <p class="text-xs text-zinc-400">{{ salesText(weekCount) }}</p>
            </div>
          </div>

          <!-- its own line: beside the total it was squeezed on phones -->
          <p v-if="bestDay" class="-mt-2 mb-4 text-xs text-zinc-400">
            Best day: <b class="whitespace-nowrap text-white">{{ bestDay.title }}</b> ·
            <span class="whitespace-nowrap">{{ peso(bestDay.total) }}</span>
          </p>

          <SalesLineChart
            :points="weekDays"
            name="Sales of the last 7 days"
            empty-text="No sales in the last 7 days."
            class="min-h-0 flex-1"
          />

          <RouterLink to="/admin/sales" class="card-link mt-4">
            Open Sales History <NavIcon name="chevron" class="h-4 w-4" />
          </RouterLink>
        </div>

        <div class="card p-5">
          <p class="eyebrow tone-blue">To do</p>
          <h2 class="card-title mb-4">Waiting for you</h2>

          <ul v-if="attention.length > 0" class="space-y-2">
            <li v-for="item in attention" :key="item.key">
              <RouterLink :to="item.to" class="todo">
                <span class="todo-icon" :class="TONES[item.tone]">
                  <NavIcon :name="item.icon" class="h-4 w-4" />
                </span>
                <span class="min-w-0 flex-1 text-sm text-zinc-300">
                  <b class="text-white">{{ count(item.n) }}</b> {{ item.label }}
                </span>
                <NavIcon name="chevron" class="h-4 w-4 shrink-0 text-zinc-500" />
              </RouterLink>
            </li>
          </ul>

          <p
            v-else-if="loaded"
            class="flex items-center gap-3 rounded-2xl bg-emerald-600/10 p-4 text-sm font-bold text-emerald-400"
          >
            <NavIcon name="check" class="h-5 w-5 shrink-0" />
            All caught up. Nothing is waiting for you.
          </p>

          <p v-else class="text-sm text-zinc-500">Loading…</p>
        </div>
      </section>

      <!-- ============================================================
           STOCK RUNNING LOW · BEST SELLERS · INSPECTIONS
      ============================================================ -->
      <section class="grid gap-5 @min-[700px]:grid-cols-2 @min-[1100px]:grid-cols-3">
        <div class="card p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow tone-amber">Inventory</p>
              <h2 class="card-title">Running low</h2>
            </div>
            <RouterLink :to="LOW_STOCK_LINK" class="card-link">
              See all <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ul v-if="lowStockList.length > 0" class="divide-y divide-white/5">
            <li v-for="product in lowStockList" :key="product.id" class="flex items-center gap-3 py-2.5">
<div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white" :title="product.name">{{ product.name }}</p>
                <p class="truncate text-xs text-zinc-500">{{ product.category || 'Uncategorized' }}</p>
              </div>

              <span v-if="isOutOfStock(product)" class="chip bg-red-600/15 text-red-400">
                <NavIcon name="alert" class="h-3.5 w-3.5" />
                Out of stock
              </span>
              <span v-else class="chip bg-yellow-500/15 text-yellow-400">
                {{ count(stockOf(product)) }} left
              </span>
            </li>
          </ul>

          <p v-else-if="loaded" class="text-sm text-zinc-500">Every product has more than {{ LOW_STOCK }} in stock.</p>

          <RouterLink
            v-if="lowStock.length > lowStockList.length"
            :to="LOW_STOCK_LINK"
            class="mt-2 inline-block text-xs text-zinc-500 hover:text-white"
          >
            and {{ count(lowStock.length - lowStockList.length) }} more in Inventory
          </RouterLink>
        </div>

        <div class="card p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow tone-green">Last 30 days</p>
              <h2 class="card-title">Best sellers</h2>
            </div>
            <RouterLink to="/admin/sales" class="card-link">
              Sales <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ol v-if="bestSellers.length > 0" class="space-y-3">
            <li v-for="item in bestSellers" :key="item.key">
              <div class="flex items-baseline justify-between gap-2">
                <p class="min-w-0 truncate text-sm font-bold text-white" :title="item.name">{{ item.name }}</p>
                <p class="shrink-0 text-sm font-bold text-white">{{ peso(item.total) }}</p>
              </div>

              <div class="mt-1.5 flex items-center gap-3">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div class="h-full rounded-full bg-emerald-500" :style="{ width: item.share + '%' }"></div>
                </div>
                <!-- how many receipts it was on (and the pieces) -->
                <span class="shrink-0 text-right text-xs text-zinc-400">
                  <b class="text-zinc-200">{{ count(item.receipts) }}</b> {{ item.receipts === 1 ? 'receipt' : 'receipts' }}
                  <span class="text-zinc-500">· {{ count(item.quantity) }} pcs</span>
                </span>
              </div>
            </li>
          </ol>

          <p v-else-if="loaded" class="text-sm text-zinc-500">No sales in the last 30 days.</p>
        </div>

        <div class="card p-5 @min-[700px]:col-span-2 @min-[1100px]:col-span-1">
          <div class="card-head">
            <div>
              <p class="eyebrow tone-violet">Schedule</p>
              <h2 class="card-title">Inspections</h2>
            </div>
            <RouterLink to="/calendar" class="card-link">
              Calendar <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ul v-if="inspections.length > 0" class="space-y-2.5">
            <li
              v-for="item in inspections.slice(0, 4)"
              :key="item.id"
              class="rounded-2xl border p-3"
              :class="isOverdue(item) ? 'border-red-500/30 bg-red-950/20' : 'border-white/5 bg-black/20'"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-white">{{ item.name }}</p>
                  <p class="truncate text-xs text-zinc-500">
                    {{ formatDay(item.inspection_date) }} · {{ item.category || 'Uncategorized' }}
                  </p>
                </div>

                <span class="chip shrink-0" :class="inspectionStatus(item).tone">
                  <NavIcon v-if="inspectionStatus(item).icon" :name="inspectionStatus(item).icon" class="h-3.5 w-3.5" />
                  {{ inspectionStatus(item).label }}
                </span>
              </div>

              <!-- how much of the batch is inspected -->
              <div class="mt-2.5 flex items-center gap-2">
                <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    class="h-full rounded-full"
                    :class="inspectionStatus(item).bar"
                    :style="{ width: inspectedPct(item) + '%' }"
                  ></div>
                </div>
                <span class="shrink-0 text-xs text-zinc-400">
                  {{ count(currentInspected(item)) }} / {{ count(inspectionQty(item)) }}
                </span>
              </div>
            </li>
          </ul>

          <p v-else-if="loaded" class="text-sm text-zinc-500">No inspections scheduled.</p>

          <p v-if="inspections.length > 4" class="mt-2 text-xs text-zinc-500">
            and {{ count(inspections.length - 4) }} more in the Calendar
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import { heldProductIds, withoutHeld } from '../../lib/heldProducts'
import DashboardHero from '../../components/DashboardHero.vue'
import AlertTile from '../../components/AlertTile.vue'
import NavIcon from '../../components/NavIcon.vue'
import SalesLineChart from '../../components/SalesLineChart.vue'
import { count, peso } from '../../lib/format'
import { LOW_STOCK, byStockLevel, isLowStock, isOutOfStock, stockOf } from '../../lib/stock'
import {
  bestDay as findBestDay,
  bestSellers as topSellers,
  changeSinceYesterday,
  dailyTotals,
  dayKey,
  pesoTile,
  salesText,
  salesThisMonth,
  salesToday,
} from '../../lib/dashboardStats'
import { isDelivered } from '../../lib/deliveries'

// Inventory showing only the products running low (emptiest first)
const LOW_STOCK_LINK = '/inventory?stock=low'

const products = ref([])
const sales = ref([])
const deliveries = ref([]) // not delivered yet
// what waits on the Approval page
const waiting = ref({ uploads: 0, inspections: 0, prices: 0, unsent: 0, refunds: 0 })

const loaded = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const updatedAt = ref(null)

// The moment the numbers are for. Set on every load, so a dashboard left
// open overnight moves to the new day when it refreshes.
const now = ref(new Date())

/* ------------------------------------------------------------------
   Loading: everything at once. Products and sales are the main numbers;
   the Approval lists only fill "Waiting for you" and deliveries only add
   to Overdue, so one that fails (e.g. its SQL wasn't run) keeps its last
   count.
------------------------------------------------------------------ */
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data || []
}

async function load() {
  if (refreshing.value) return
  refreshing.value = true

  const [productsResult, salesResult, uploads, inspectionList, review, unsent, deliveryList, receivingList, heldResult, refundList] = await Promise.allSettled([
    rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
    rpc('list_all_sales'),
    rpc('admin_list_supplier_uploads', { p_status: 'pending' }),
    rpc('list_submitted_approvals'),
    rpc('admin_list_receipt_review'),
    rpc('admin_list_unsent_supplier_uploads'),
    rpc('list_deliveries'),
    rpc('admin_list_receivings'),
    heldProductIds(),
    rpc('admin_list_refunds'),
  ])

  const problems = []

  // without products that exist by name only (lib/heldProducts.js)
  const held = heldResult.status === 'fulfilled' ? heldResult.value : new Set()
  if (productsResult.status === 'fulfilled') products.value = withoutHeld(productsResult.value, held)
  else problems.push(`the products (${productsResult.reason?.message || productsResult.reason})`)

  if (salesResult.status === 'fulfilled') sales.value = salesResult.value
  else problems.push(`the sales (${salesResult.reason?.message || salesResult.reason})`)

  // a list that failed keeps its last count
  const sizeOf = (result, last) => (result.status === 'fulfilled' ? result.value.length : last)
  const last = waiting.value

  // a receipt waiting for its delivery has its prices set already: the
  // Approval page lists it under Deliveries, not "prices to check"
  const awaited = new Set(
    receivingList.status === 'fulfilled'
      ? receivingList.value
          .filter((delivery) => delivery.status === 'waiting')
          .map((delivery) => String(delivery.receipt_ref))
      : []
  )

  waiting.value = {
    uploads: sizeOf(uploads, last.uploads),
    inspections: sizeOf(inspectionList, last.inspections),
    // one per receipt, not per product
    prices:
      review.status === 'fulfilled'
        ? new Set(
            review.value
              .filter((item) => !awaited.has(String(item.upload_ref)))
              .map((item) => item.upload_ref || 'other')
          ).size
        : last.prices,
    unsent: sizeOf(unsent, last.unsent),
    refunds:
      refundList.status === 'fulfilled'
        ? refundList.value.filter((request) => request.status === 'pending').length
        : last.refunds,
  }

  if (deliveryList.status === 'fulfilled') deliveries.value = deliveryList.value.filter((item) => !isDelivered(item))

  for (const result of [uploads, inspectionList, review, unsent, deliveryList]) {
    if (result.status === 'rejected') console.error(result.reason)
  }

  errorMessage.value = problems.length ? `Couldn't load ${problems.join(' and ')}.` : ''
  now.value = new Date()
  updatedAt.value = now.value
  loaded.value = true
  refreshing.value = false
}

// Back to this tab after a while (e.g. the dashboard was left open at the
// counter): bring the numbers up to date.
const STALE_MS = 60 * 1000

function onVisibility() {
  if (document.visibilityState !== 'visible' || !updatedAt.value) return
  if (Date.now() - updatedAt.value.getTime() > STALE_MS) load()
}

onMounted(() => {
  load()
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

/* ------------------------------------------------------------------
   Dates (this computer's clock, like the rest of the app)
------------------------------------------------------------------ */
const monthName = computed(() => now.value.toLocaleDateString(undefined, { month: 'long' }))

const updatedText = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
)

/* ------------------------------------------------------------------
   Sales (the sums: lib/dashboardStats.js, shared with the Cashier's)
------------------------------------------------------------------ */
const today = computed(() => salesToday(sales.value, now.value))

// today so far against yesterday up to the same time
const todayChange = computed(() => changeSinceYesterday(sales.value, now.value))

const month = computed(() => salesThisMonth(sales.value, now.value))

// one column per day, oldest first, today last
const weekDays = computed(() => dailyTotals(sales.value, now.value, 7))

const weekTotal = computed(() => weekDays.value.reduce((sum, day) => sum + day.total, 0))
const weekCount = computed(() => weekDays.value.reduce((sum, day) => sum + day.count, 0))

const bestDay = computed(() => findBestDay(weekDays.value))

// top 5 products of the last 30 days by money taken, with their picture
const bestSellers = computed(() => topSellers(sales.value, products.value, now.value))

/* ------------------------------------------------------------------
   Stock (what "low" means: lib/stock.js)
------------------------------------------------------------------ */
// emptiest first
const lowStock = computed(() => products.value.filter(isLowStock).sort(byStockLevel))

const outOfStock = computed(() => lowStock.value.filter(isOutOfStock))

const lowStockList = computed(() => lowStock.value.slice(0, 6))

/* ------------------------------------------------------------------
   Inspections (same rules as the Calendar)
------------------------------------------------------------------ */
function currentInspected(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

// Size of the batch being inspected, fixed when the inspection was scheduled.
function inspectionQty(product) {
  return Number(product?.inspection_qty ?? product?.quantity ?? 0)
}

function isOverdue(product) {
  return product.inspection_date < dayKey(now.value) && currentInspected(product) < inspectionQty(product)
}

// today and later, plus earlier ones that aren't finished
const inspections = computed(() => {
  const todayKey = dayKey(now.value)

  return products.value
    .filter(
      (product) =>
        product.inspection_date &&
        (product.inspection_date >= todayKey || currentInspected(product) < inspectionQty(product))
    )
    .sort((a, b) => String(a.inspection_date).localeCompare(String(b.inspection_date)))
})

function inspectedPct(product) {
  const total = inspectionQty(product)
  return total > 0 ? Math.min(100, (currentInspected(product) / total) * 100) : 0
}

function inspectionStatus(product) {
  if (isOverdue(product)) {
    return { label: 'Overdue', icon: 'alert', tone: 'bg-red-600/15 text-red-400', bar: 'bg-red-500' }
  }
  if (Number(product.return_count) > 0) {
    return { label: 'Return', icon: '', tone: 'bg-red-600/15 text-red-400', bar: 'bg-zinc-300' }
  }
  if (currentInspected(product) >= inspectionQty(product)) {
    return { label: 'Done', icon: 'check', tone: 'bg-emerald-600/15 text-emerald-400', bar: 'bg-emerald-500' }
  }
  return { label: 'Pending', icon: '', tone: 'bg-yellow-500/15 text-yellow-400', bar: 'bg-zinc-300' }
}

// "Today", or "Oct 14, 2026" ("2026-10-14" is a local date, not UTC midnight)
function formatDay(date) {
  if (!date) return 'No date'
  if (date === dayKey(now.value)) return 'Today'

  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ------------------------------------------------------------------
   The Low stock and Overdue tiles
------------------------------------------------------------------ */
function noun(n, word, plural = `${word}s`) {
  return n === 1 ? word : plural
}

const overdueInspections = computed(() => inspections.value.filter(isOverdue))

const overdueDeliveries = computed(() => {
  const todayKey = dayKey(now.value)
  return deliveries.value.filter((item) => item.delivery_date && String(item.delivery_date).slice(0, 10) < todayKey)
})

// inspections and deliveries past their date
const overdueCount = computed(() => overdueInspections.value.length + overdueDeliveries.value.length)

const overdueText = computed(() => {
  const inspectionCount = overdueInspections.value.length
  const deliveryCount = overdueDeliveries.value.length
  const parts = []

  if (inspectionCount > 0) parts.push(`${count(inspectionCount)} ${noun(inspectionCount, 'inspection')}`)
  if (deliveryCount > 0) parts.push(`${count(deliveryCount)} ${noun(deliveryCount, 'delivery', 'deliveries')}`)

  return parts.join(' · ') || 'Nothing is late'
})

// only deliveries late: open the Calendar on that tab
const overdueLink = computed(() =>
  overdueDeliveries.value.length > 0 && overdueInspections.value.length === 0 ? '/calendar?tab=delivery' : '/calendar'
)

/* ------------------------------------------------------------------
   Waiting for you: the approvals and checks only you can do
------------------------------------------------------------------ */
// amber = something went wrong, blue = waiting for you (the same colours
// as everywhere else)
const TONES = {
  warning: 'bg-yellow-500/15 text-yellow-400',
  task: 'bg-sky-500/15 text-sky-300',
}

const attention = computed(() => {
  const w = waiting.value

  return [
    { key: 'unsent', n: w.unsent, label: (n) => `approved ${noun(n, 'receipt')} not sent to the scanner`, to: '/approval', icon: 'alert', tone: 'warning' },
    { key: 'uploads', n: w.uploads, label: (n) => `supplier ${noun(n, 'receipt')} to approve`, to: '/approval', icon: 'docs', tone: 'task' },
    { key: 'inspections', n: w.inspections, label: (n) => `${noun(n, 'inspection')} to approve`, to: '/approval?tab=inspections', icon: 'approval', tone: 'task' },
    { key: 'refunds', n: w.refunds, label: (n) => `cashier ${noun(n, 'refund')} to approve`, to: '/admin/sales?view=refunds', icon: 'tag', tone: 'task' },
    { key: 'prices', n: w.prices, label: (n) => `${noun(n, 'receipt')} with new prices to check`, to: '/approval', icon: 'tag', tone: 'task' },
  ]
    .filter((item) => item.n > 0)
    .map((item) => ({ ...item, label: item.label(item.n) }))
})
</script>

<style scoped src="../../styles/dashboard.css"></style>
