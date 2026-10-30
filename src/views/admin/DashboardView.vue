<template>
  <!-- @container: the layout follows the width of the page area (the
       sidebar takes part of the window), not the whole window -->
  <div class="@container">
    <PageHeader title="Dashboard" :subtitle="`${todayLong} · Sales, stock and what needs your attention.`">
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
    </PageHeader>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
      {{ errorMessage }}
    </p>

    <!-- while refreshing, the numbers stay where they are (dimmed) instead
         of disappearing and jumping back -->
    <div class="transition-opacity" :class="{ 'opacity-60': refreshing && loaded }">
      <!-- ============================================================
           AT A GLANCE: today's sales is the big number
      ============================================================ -->
      <section class="mb-5 grid grid-cols-2 gap-3 @min-[900px]:grid-cols-5" aria-label="At a glance">
        <RouterLink to="/admin/sales" class="kpi col-span-2">
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

        <RouterLink to="/admin/sales" class="kpi col-span-2 @min-[900px]:col-span-1">
          <div class="kpi-top">
            <p class="kpi-label">Sales this month</p>
            <span class="kpi-icon"><NavIcon name="pos" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value" :title="peso(month.total)">{{ loaded ? pesoTile(month.total) : '—' }}</p>
          <p class="kpi-sub">{{ salesText(month.count) }} in {{ monthName }}</p>
        </RouterLink>

        <RouterLink :to="LOW_STOCK_LINK" class="kpi">
          <div class="kpi-top">
            <p class="kpi-label">Low stock</p>
            <span class="kpi-icon"><NavIcon name="inventory" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value">{{ loaded ? count(lowStock.length) : '—' }}</p>
          <p class="kpi-sub">of {{ count(products.length) }} products</p>

          <p v-if="outOfStock.length > 0" class="kpi-change text-red-400">
            <NavIcon name="alert" class="h-3.5 w-3.5 shrink-0" />
            {{ count(outOfStock.length) }} out of stock
          </p>
        </RouterLink>

        <RouterLink :to="approvalLink" class="kpi">
          <div class="kpi-top">
            <p class="kpi-label">To approve</p>
            <span class="kpi-icon"><NavIcon name="approval" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value">{{ loaded ? count(waitingTotal) : '—' }}</p>
          <p class="kpi-sub">{{ waitingText }}</p>
        </RouterLink>
      </section>

      <!-- ============================================================
           SALES OF THE WEEK + WHAT NEEDS ATTENTION
      ============================================================ -->
      <section class="mb-5 grid gap-5 @min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <!-- the chart grows to the height of the to-do card beside it -->
        <div class="card flex flex-col p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Sales</p>
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
          <p class="eyebrow">To do</p>
          <h2 class="card-title mb-4">Needs your attention</h2>

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
            All caught up. Nothing needs your attention.
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
              <p class="eyebrow">Inventory</p>
              <h2 class="card-title">Running low</h2>
            </div>
            <RouterLink :to="LOW_STOCK_LINK" class="card-link">
              See all <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ul v-if="lowStockList.length > 0" class="divide-y divide-white/5">
            <li v-for="product in lowStockList" :key="product.id" class="flex items-center gap-3 py-2.5">
              <img
                v-if="product.image_url"
                :src="product.image_url"
                alt=""
                loading="lazy"
                class="h-10 w-10 shrink-0 rounded-[10px] object-cover"
              />
              <span v-else class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/5 text-zinc-500">
                <NavIcon name="inventory" class="h-5 w-5" />
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white">{{ product.name }}</p>
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
              <p class="eyebrow">Last 30 days</p>
              <h2 class="card-title">Best sellers</h2>
            </div>
            <RouterLink to="/admin/sales" class="card-link">
              Sales <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ol v-if="bestSellers.length > 0" class="space-y-3">
            <li v-for="(item, i) in bestSellers" :key="item.key" class="flex items-center gap-3">
              <img
                v-if="item.image"
                :src="item.image"
                alt=""
                loading="lazy"
                class="h-10 w-10 shrink-0 rounded-[10px] object-cover"
              />
              <span v-else class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/5 text-zinc-500">
                <NavIcon name="inventory" class="h-5 w-5" />
              </span>

              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-2">
                  <p class="min-w-0 truncate text-sm font-bold text-white">
                    <span class="mr-1 text-zinc-500">{{ i + 1 }}.</span>{{ item.name }}
                  </p>
                  <p class="shrink-0 text-sm font-bold text-white">{{ peso(item.total) }}</p>
                </div>

                <div class="mt-1.5 flex items-center gap-2">
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div class="h-full rounded-full bg-red-600" :style="{ width: item.share + '%' }"></div>
                  </div>
                  <span class="w-16 shrink-0 text-right text-xs text-zinc-500">{{ count(item.quantity) }} pcs</span>
                </div>
              </div>
            </li>
          </ol>

          <p v-else-if="loaded" class="text-sm text-zinc-500">No sales in the last 30 days.</p>
        </div>

        <div class="card p-5 @min-[700px]:col-span-2 @min-[1100px]:col-span-1">
          <div class="card-head">
            <div>
              <p class="eyebrow">Schedule</p>
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
import PageHeader from '../../components/PageHeader.vue'
import NavIcon from '../../components/NavIcon.vue'
import SalesLineChart from '../../components/SalesLineChart.vue'
import { count, peso } from '../../lib/format'
import { LOW_STOCK, byStockLevel, isLowStock, isOutOfStock, stockOf } from '../../lib/stock'

// Inventory showing only the products running low (emptiest first)
const LOW_STOCK_LINK = '/inventory?stock=low'

const products = ref([])
const sales = ref([])
// what waits on the Approval page
const waiting = ref({ uploads: 0, inspections: 0, prices: 0, unsent: 0 })

const loaded = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const updatedAt = ref(null)

// The moment the numbers are for. Set on every load, so a dashboard left
// open overnight moves to the new day when it refreshes.
const now = ref(new Date())

/* ------------------------------------------------------------------
   Loading: everything at once. Products and sales are the main numbers;
   the Approval lists only add to "To approve", so one that fails (e.g.
   its SQL wasn't run) is just left out of the count.
------------------------------------------------------------------ */
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data || []
}

async function load() {
  if (refreshing.value) return
  refreshing.value = true

  const [productsResult, salesResult, uploads, inspectionList, review, unsent] = await Promise.allSettled([
    rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
    rpc('list_all_sales'),
    rpc('admin_list_supplier_uploads', { p_status: 'pending' }),
    rpc('list_submitted_approvals'),
    rpc('admin_list_receipt_review'),
    rpc('admin_list_unsent_supplier_uploads'),
  ])

  const problems = []

  if (productsResult.status === 'fulfilled') products.value = productsResult.value
  else problems.push(`the products (${productsResult.reason?.message || productsResult.reason})`)

  if (salesResult.status === 'fulfilled') sales.value = salesResult.value
  else problems.push(`the sales (${salesResult.reason?.message || salesResult.reason})`)

  // a list that failed keeps its last count
  const sizeOf = (result, last) => (result.status === 'fulfilled' ? result.value.length : last)
  const last = waiting.value

  waiting.value = {
    uploads: sizeOf(uploads, last.uploads),
    inspections: sizeOf(inspectionList, last.inspections),
    // one per receipt, not per product
    prices:
      review.status === 'fulfilled'
        ? new Set(review.value.map((item) => item.upload_ref || 'other')).size
        : last.prices,
    unsent: sizeOf(unsent, last.unsent),
  }

  for (const result of [uploads, inspectionList, review, unsent]) {
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
function startOfDay(date, addDays = 0) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + addDays)
}

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const todayLong = computed(() =>
  now.value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)

const monthName = computed(() => now.value.toLocaleDateString(undefined, { month: 'long' }))

const updatedText = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
)

/* ------------------------------------------------------------------
   Sales
------------------------------------------------------------------ */
function salesBetween(from, to) {
  return sales.value.filter((sale) => {
    const at = new Date(sale.created_at)
    return at >= from && at < to
  })
}

function summarize(list) {
  return list.reduce(
    (sum, sale) => {
      sum.total += Number(sale.total_amount || 0)
      sum.count += 1
      sum.items += (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
      return sum
    },
    { total: 0, count: 0, items: 0 }
  )
}

function salesText(n) {
  return `${count(n)} sale${n === 1 ? '' : 's'}`
}

// ₱1,234.50, or ₱1.23M once it no longer fits a small tile
const MILLIONS = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 2 })

function pesoTile(value) {
  return Math.abs(value) >= 1e6 ? '₱' + MILLIONS.format(value) : peso(value)
}

const today = computed(() => summarize(salesBetween(startOfDay(now.value), startOfDay(now.value, 1))))

// Today so far against yesterday up to the same time of day, so a morning
// isn't compared with a whole day.
const todayChange = computed(() => {
  const yesterday = startOfDay(now.value, -1)
  const sameTimeYesterday = new Date(
    yesterday.getFullYear(),
    yesterday.getMonth(),
    yesterday.getDate(),
    now.value.getHours(),
    now.value.getMinutes(),
    now.value.getSeconds()
  )
  const before = summarize(salesBetween(yesterday, sameTimeYesterday)).total

  if (!(before > 0)) return null

  const change = Math.round(((today.value.total - before) / before) * 100)

  if (change === 0) return { icon: '', tone: 'text-zinc-400', text: 'Same as this time yesterday' }

  return change > 0
    ? { icon: 'up', tone: 'text-emerald-400', text: `${count(change)}% more than this time yesterday` }
    : { icon: 'down', tone: 'text-red-400', text: `${count(-change)}% less than this time yesterday` }
})

const month = computed(() =>
  summarize(salesBetween(new Date(now.value.getFullYear(), now.value.getMonth(), 1), startOfDay(now.value, 1)))
)

// one column per day, oldest first, today last
const weekDays = computed(() => {
  const days = []

  for (let back = 6; back >= 0; back--) {
    const date = startOfDay(now.value, -back)
    days.push({
      key: dayKey(date),
      label: back === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' }),
      title: date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
      current: back === 0,
      total: 0,
      count: 0,
    })
  }

  const index = new Map(days.map((day, i) => [day.key, i]))

  for (const sale of sales.value) {
    const i = index.get(dayKey(new Date(sale.created_at)))
    if (i === undefined) continue
    days[i].total += Number(sale.total_amount || 0)
    days[i].count += 1
  }

  return days
})

const weekTotal = computed(() => weekDays.value.reduce((sum, day) => sum + day.total, 0))
const weekCount = computed(() => weekDays.value.reduce((sum, day) => sum + day.count, 0))

const bestDay = computed(() => {
  const best = weekDays.value.reduce((a, b) => (b.total > a.total ? b : a))
  return best.total > 0 ? best : null
})

// top 5 products of the last 30 days by money taken, with their picture
const bestSellers = computed(() => {
  const since = startOfDay(now.value, -29)
  const imageById = new Map(products.value.map((p) => [String(p.id), p.image_url]))
  const imageByName = new Map(products.value.map((p) => [p.name, p.image_url]))
  const rows = new Map()

  for (const sale of sales.value) {
    if (new Date(sale.created_at) < since) continue

    for (const item of sale.sale_items || []) {
      const key = item.product_id != null ? `id:${item.product_id}` : `name:${item.product_name}`
      const row = rows.get(key) || {
        key,
        name: item.product_name || 'Unknown product',
        quantity: 0,
        total: 0,
        image: imageById.get(String(item.product_id)) || imageByName.get(item.product_name) || '',
      }

      row.quantity += Number(item.quantity || 0)
      row.total += Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))
      rows.set(key, row)
    }
  }

  const list = [...rows.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  const top = list[0]?.total || 0

  return list.map((row) => ({ ...row, share: top ? Math.max((row.total / top) * 100, 2) : 0 }))
})

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
   To approve / Needs your attention
------------------------------------------------------------------ */
const waitingTotal = computed(() => {
  const w = waiting.value
  return w.uploads + w.inspections + w.prices + w.unsent
})

const waitingText = computed(() => {
  const w = waiting.value
  const receipts = w.uploads + w.prices + w.unsent
  const parts = []

  if (receipts > 0) parts.push(`${count(receipts)} receipt${receipts === 1 ? '' : 's'}`)
  if (w.inspections > 0) parts.push(`${count(w.inspections)} inspection${w.inspections === 1 ? '' : 's'}`)

  return parts.join(' · ') || 'Nothing waiting'
})

// only inspections waiting: open the Approval page on that tab
const approvalLink = computed(() => {
  const w = waiting.value
  return w.inspections > 0 && w.uploads + w.prices + w.unsent === 0 ? '/approval?tab=inspections' : '/approval'
})

// how each kind of to-do looks: red = something is wrong, amber = soon,
// grey = waiting for you
const TONES = {
  critical: 'bg-red-600/15 text-red-400',
  warning: 'bg-yellow-500/15 text-yellow-400',
  task: 'bg-white/5 text-zinc-300',
}

function noun(n, word) {
  return n === 1 ? word : `${word}s`
}

// most urgent first; only what has something in it
const attention = computed(() => {
  const w = waiting.value
  const overdue = inspections.value.filter(isOverdue).length
  const lowOnly = lowStock.value.length - outOfStock.value.length

  return [
    { key: 'out', n: outOfStock.value.length, label: (n) => `${noun(n, 'product')} out of stock`, to: LOW_STOCK_LINK, icon: 'alert', tone: 'critical' },
    { key: 'overdue', n: overdue, label: (n) => `${noun(n, 'inspection')} overdue`, to: '/calendar', icon: 'calendar', tone: 'critical' },
    { key: 'uploads', n: w.uploads, label: (n) => `supplier ${noun(n, 'receipt')} to approve`, to: '/approval', icon: 'docs', tone: 'task' },
    { key: 'inspections', n: w.inspections, label: (n) => `${noun(n, 'inspection')} to approve`, to: '/approval?tab=inspections', icon: 'approval', tone: 'task' },
    { key: 'prices', n: w.prices, label: (n) => `${noun(n, 'receipt')} with new prices to check`, to: '/approval', icon: 'tag', tone: 'task' },
    { key: 'unsent', n: w.unsent, label: (n) => `approved ${noun(n, 'receipt')} not sent to the scanner`, to: '/approval', icon: 'alert', tone: 'warning' },
    { key: 'low', n: lowOnly, label: (n) => `${noun(n, 'product')} running low`, to: LOW_STOCK_LINK, icon: 'inventory', tone: 'warning' },
  ]
    .filter((item) => item.n > 0)
    .map((item) => ({ ...item, label: item.label(item.n) }))
})
</script>

<style scoped>
/* ---- the tiles at the top (each opens its page) ---- */
.kpi {
  position: relative;
  display: block;
  overflow: hidden;
  /* the numbers size themselves to the tile (cqi below) */
  container-type: inline-size;
  border-radius: var(--radius-md);
  border: 1px solid var(--hairline);
  background: linear-gradient(180deg, var(--surface-raised), var(--surface));
  box-shadow: var(--shadow-card);
  padding: 1rem 1.1rem;
  transition:
    border-color 0.18s var(--ease),
    transform 0.18s var(--ease),
    box-shadow 0.18s var(--ease);
}

/* crimson top edge, like the other stat tiles */
.kpi::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(90deg, var(--brand), rgba(224, 27, 50, 0));
}

.kpi:hover,
.kpi:focus-visible {
  outline: none;
  border-color: rgba(224, 27, 50, 0.35);
  transform: translateY(-2px);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.5),
    0 14px 32px -16px rgba(224, 27, 50, 0.45);
}

.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.kpi-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-zinc-400);
}

.kpi-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-zinc-400);
}

/* the one big number of the page */
.kpi-hero {
  margin-top: 0.35rem;
  white-space: nowrap;
  font-size: clamp(1.8rem, 12cqi, 3.4rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: #fff;
}

.kpi-value {
  margin-top: 0.35rem;
  white-space: nowrap;
  font-size: clamp(1.25rem, 13cqi, 1.9rem);
  font-weight: 800;
  line-height: 1.1;
  color: #fff;
}

.kpi-sub {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  color: var(--color-zinc-400);
}

.kpi-change {
  margin-top: 0.3rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  font-weight: 700;
}

/* ---- cards ---- */
.eyebrow {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.card-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #fff;
}

.card-head {
  margin-bottom: 1rem;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}

.card-link {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-zinc-400);
}

.card-link:hover {
  color: #fff;
}

/* ---- needs your attention ---- */
.todo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--hairline);
  background: rgba(0, 0, 0, 0.2);
  padding: 0.6rem 0.75rem;
}

.todo:hover {
  border-color: rgba(224, 27, 50, 0.35);
  background: rgba(255, 255, 255, 0.03);
}

.todo-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.6rem;
}

/* small state labels: always a word (and an icon when it's a warning) */
.chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.3rem;
  white-space: nowrap;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.7rem;
  font-weight: 700;
}
</style>
