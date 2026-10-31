<template>
  <!-- Built like the Owner's Dashboard (same tiles and cards: styles/dashboard.css),
       with what staff work on: inspections, deliveries and stock.
       @container: the layout follows the width of the page area. -->
  <div class="@container">
    <PageHeader title="Dashboard" :subtitle="`${todayLong} · Inspections, deliveries and stock to keep an eye on.`">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
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
        <RouterLink
          :to="CALENDAR"
          class="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
        >
          <NavIcon name="calendar" class="h-4 w-4" />
          Open Calendar
        </RouterLink>
      </div>
    </PageHeader>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
      {{ errorMessage }}
    </p>

    <!-- while refreshing, the numbers stay where they are (dimmed) -->
    <div class="transition-opacity" :class="{ 'opacity-60': refreshing && loaded }">
      <!-- ============================================================
           AT A GLANCE: what to inspect now is the big number
      ============================================================ -->
      <section class="mb-5 grid grid-cols-2 gap-3 @min-[900px]:grid-cols-5" aria-label="At a glance">
        <RouterLink :to="CALENDAR" class="kpi col-span-2">
          <div class="kpi-top">
            <p class="kpi-label">To inspect now</p>
            <span class="kpi-icon"><NavIcon name="approval" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-hero">
            {{ loaded ? count(dueNow.length) : '—' }} <span v-if="loaded" class="kpi-unit">{{ noun(dueNow.length, 'product') }}</span>
          </p>

          <p class="kpi-sub">
            <template v-if="dueNow.length > 0">{{ count(piecesDue) }} pcs left to inspect, today and overdue</template>
            <template v-else-if="loaded">Nothing to inspect today</template>
          </p>

          <p v-if="overdue.length > 0" class="kpi-change text-red-400">
            <NavIcon name="alert" class="h-3.5 w-3.5 shrink-0" />
            {{ count(overdue.length) }} overdue
          </p>
          <p v-else-if="nextUp" class="kpi-change text-zinc-400">
            <span class="min-w-0 truncate">Next: {{ formatDay(nextUp.date) }} · {{ nextUp.item.name }}</span>
          </p>
        </RouterLink>

        <RouterLink :to="CALENDAR" class="kpi col-span-2 @min-[900px]:col-span-1">
          <div class="kpi-top">
            <p class="kpi-label">Next 7 days</p>
            <span class="kpi-icon"><NavIcon name="calendar" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value">{{ loaded ? count(upcomingWeek.length) : '—' }}</p>
          <p class="kpi-sub">{{ noun(upcomingWeek.length, 'inspection') }} coming up</p>
        </RouterLink>

        <RouterLink :to="CALENDAR" class="kpi">
          <div class="kpi-top">
            <p class="kpi-label">With the owner</p>
            <span class="kpi-icon"><NavIcon name="check" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value">{{ loaded ? count(submitted.length) : '—' }}</p>
          <p class="kpi-sub">
            {{ submitted.length > 0 ? `${count(submittedPieces)} pcs to approve` : 'Nothing submitted' }}
          </p>

          <p v-if="mySaved.length > 0" class="kpi-change text-yellow-400">
            {{ count(mySaved.length) }} saved, not submitted
          </p>
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
      </section>

      <!-- ============================================================
           INSPECTIONS + WHAT NEEDS ATTENTION
      ============================================================ -->
      <section class="mb-5 grid gap-5 @min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div class="card p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Schedule</p>
              <h2 class="card-title">Inspections</h2>
            </div>
            <RouterLink :to="CALENDAR" class="card-link">
              Calendar <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <!-- what the colours of the progress bars mean (as in the Calendar) -->
          <div class="legend mb-3" aria-hidden="true">
            <span><i class="bg-red-600"></i>Approved</span>
            <span><i class="bg-lime-400"></i>Saved</span>
            <span><i class="bg-yellow-400"></i>Submitted</span>
          </div>

          <ul v-if="inspectionRows.length > 0" class="space-y-2.5">
            <li
              v-for="row in inspectionRows.slice(0, SHOWN_INSPECTIONS)"
              :key="row.item.id"
              class="rounded-2xl border p-3"
              :class="row.overdue ? 'border-red-500/30 bg-red-950/20' : 'border-white/5 bg-black/20'"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-bold text-white">{{ row.item.name }}</p>
                  <p class="truncate text-xs text-zinc-500">
                    {{ formatDay(row.date) }} · {{ row.item.category || 'Uncategorized' }}
                  </p>
                </div>

                <span class="chip shrink-0" :class="rowStatus(row).tone">
                  <NavIcon v-if="rowStatus(row).icon" :name="rowStatus(row).icon" class="h-3.5 w-3.5" />
                  {{ rowStatus(row).label }}
                </span>
              </div>

              <!-- how much of the batch is approved, saved and submitted -->
              <div class="mt-2.5 flex items-center gap-2">
                <div class="flex h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div class="h-full bg-red-600" :style="{ width: row.approvedPct + '%' }"></div>
                  <div class="h-full bg-lime-400" :style="{ width: row.savedPct + '%' }"></div>
                  <div class="h-full bg-yellow-400" :style="{ width: row.submittedPct + '%' }"></div>
                </div>
                <span class="shrink-0 text-xs text-zinc-400">{{ count(row.done) }} / {{ count(row.qty) }}</span>
              </div>
            </li>
          </ul>

          <p v-else-if="loaded" class="text-sm text-zinc-500">No inspections scheduled.</p>

          <RouterLink
            v-if="inspectionRows.length > SHOWN_INSPECTIONS"
            :to="CALENDAR"
            class="mt-2 inline-block text-xs text-zinc-500 hover:text-white"
          >
            and {{ count(inspectionRows.length - SHOWN_INSPECTIONS) }} more in the Calendar
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
           STOCK RUNNING LOW · DELIVERIES · RECENT INSPECTION WORK
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
              <p class="eyebrow">Calendar</p>
              <h2 class="card-title">Deliveries</h2>
            </div>
            <RouterLink :to="DELIVERIES" class="card-link">
              Calendar <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ul v-if="deliveryRows.length > 0" class="divide-y divide-white/5">
            <li
              v-for="delivery in deliveryRows.slice(0, SHOWN_DELIVERIES)"
              :key="delivery.id"
              class="flex items-center gap-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white">{{ delivery.title || 'Delivery' }}</p>
                <p class="truncate text-xs text-zinc-500">
                  {{ formatDay(delivery.date) }} · {{ delivery.supplier || 'No supplier' }}
                </p>
              </div>

              <span class="chip" :class="deliveryStatus(delivery).tone">
                <NavIcon v-if="deliveryStatus(delivery).icon" :name="deliveryStatus(delivery).icon" class="h-3.5 w-3.5" />
                {{ deliveryStatus(delivery).label }}
              </span>
            </li>
          </ul>

          <p v-else-if="deliveriesFailed" class="text-sm text-red-400">Couldn't load the deliveries.</p>
          <p v-else-if="loaded" class="text-sm text-zinc-500">No deliveries scheduled.</p>

          <p v-if="deliveryRows.length > SHOWN_DELIVERIES" class="mt-2 text-xs text-zinc-500">
            and {{ count(deliveryRows.length - SHOWN_DELIVERIES) }} more in the Calendar
          </p>
        </div>

        <div class="card p-5 @min-[700px]:col-span-2 @min-[1100px]:col-span-1">
          <div class="card-head">
            <div>
              <p class="eyebrow">Inspections</p>
              <h2 class="card-title">Recent work</h2>
            </div>
            <RouterLink :to="CALENDAR" class="card-link">
              Calendar <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <!-- pieces counted so far that the owner hasn't approved yet -->
          <div class="mb-3 flex flex-wrap gap-2">
            <span class="chip bg-lime-400/15 text-lime-400">Saved {{ count(savedPieces) }} pcs</span>
            <span class="chip bg-yellow-500/15 text-yellow-400">Submitted {{ count(submittedPieces) }} pcs</span>
          </div>

          <ul v-if="recentWork.length > 0" class="divide-y divide-white/5">
            <li v-for="approval in recentWork" :key="approval.id" class="flex items-center gap-3 py-2.5">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white">{{ approval.product_name || 'Product' }}</p>
                <p class="truncate text-xs text-zinc-500">
                  {{ isMine(approval) ? 'You' : approval.requested_by || 'Staff' }} ·
                  Approved {{ count(approval.approved_qty) }} · Return {{ count(approval.return_qty) }}
                </p>
              </div>

              <span
                class="chip"
                :class="approval.status === 'submitted' ? 'bg-yellow-500/15 text-yellow-400' : 'bg-lime-400/15 text-lime-400'"
              >
                {{ approval.status === 'submitted' ? 'Submitted' : 'Saved' }}
              </span>
            </li>
          </ul>

          <p v-else-if="loaded" class="text-sm text-zinc-500">No saved or submitted inspections.</p>
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
import { count } from '../../lib/format'
import { LOW_STOCK, byStockLevel, isLowStock, isOutOfStock, stockOf } from '../../lib/stock'
import { dayKey, startOfDay } from '../../lib/dashboardStats'

const CALENDAR = '/staff/calendar'
// the Calendar's Delivery tab
const DELIVERIES = '/staff/calendar?tab=delivery'
// Inventory showing only the products running low (emptiest first)
const LOW_STOCK_LINK = '/staff/inventory?stock=low'

const SHOWN_INSPECTIONS = 5
const SHOWN_DELIVERIES = 4

const products = ref([])
const approvals = ref([]) // saved and submitted inspections, waiting for the owner
const deliveries = ref([]) // not delivered yet
const deliveriesFailed = ref(false)

const loaded = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const updatedAt = ref(null)

// The moment the numbers are for. Set on every load, so a dashboard left
// open overnight moves to the new day when it refreshes.
const now = ref(new Date())

/* ------------------------------------------------------------------
   Who "you" are: an inspection is yours by your id (older ones, saved
   before ids were kept, by your name), as in the Calendar.
------------------------------------------------------------------ */
const myUserId = ref(null)

const myName = (() => {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || '{}')
    return user.full_name || user.email || 'Staff'
  } catch {
    return 'Staff'
  }
})()

function isMine(approval) {
  if (approval.requested_by_id) return approval.requested_by_id === myUserId.value
  return approval.requested_by === myName
}

/* ------------------------------------------------------------------
   Loading: products and inspections are the main numbers; deliveries
   only fill their own card, so a failure there says so in that card.
------------------------------------------------------------------ */
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data || []
}

function isDelivered(delivery) {
  return ['delivered', 'done', 'completed'].includes(String(delivery.status || '').trim().toLowerCase())
}

async function load() {
  if (refreshing.value) return
  refreshing.value = true

  if (!myUserId.value) {
    const { data } = await supabase.auth.getSession()
    myUserId.value = data?.session?.user?.id || null
  }

  const [productsResult, approvalsResult, deliveriesResult] = await Promise.allSettled([
    rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
    rpc('list_active_approvals'),
    rpc('list_deliveries'),
  ])

  const problems = []

  if (productsResult.status === 'fulfilled') products.value = productsResult.value
  else problems.push(`the products (${productsResult.reason?.message || productsResult.reason})`)

  if (approvalsResult.status === 'fulfilled') approvals.value = approvalsResult.value
  else problems.push(`the inspections (${approvalsResult.reason?.message || approvalsResult.reason})`)

  deliveriesFailed.value = deliveriesResult.status !== 'fulfilled'
  if (deliveriesFailed.value) console.error(deliveriesResult.reason)
  else deliveries.value = deliveriesResult.value.filter((delivery) => !isDelivered(delivery))

  errorMessage.value = problems.length ? `Couldn't load ${problems.join(' and ')}.` : ''
  now.value = new Date()
  updatedAt.value = now.value
  loaded.value = true
  refreshing.value = false
}

// Back to this tab after a while: bring the numbers up to date.
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
const todayKey = computed(() => dayKey(now.value))

const todayLong = computed(() =>
  now.value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)

const updatedText = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
)

// "Today", "Tomorrow", "Yesterday", "Mon, Nov 3" ('YYYY-MM-DD' is a local date)
function formatDay(key) {
  if (!key) return 'No date'
  if (key === todayKey.value) return 'Today'
  if (key === dayKey(startOfDay(now.value, 1))) return 'Tomorrow'
  if (key === dayKey(startOfDay(now.value, -1))) return 'Yesterday'

  const [y, m, d] = key.split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(y === now.value.getFullYear() ? {} : { year: 'numeric' }),
  })
}

function noun(n, word, plural = `${word}s`) {
  return n === 1 ? word : plural
}

/* ------------------------------------------------------------------
   Inspections, by the Staff Calendar's rules: pieces saved or submitted
   count as inspected, so a batch that's all counted isn't "overdue"
   while it waits for the owner.
------------------------------------------------------------------ */
// saved and submitted pieces per product
const pendingByProduct = computed(() => {
  const map = new Map()

  for (const approval of approvals.value) {
    const row = map.get(approval.product_id) || { saved: 0, submitted: 0 }
    const pieces = Number(approval.approved_qty || 0) + Number(approval.return_qty || 0)

    if (approval.status === 'saved') row.saved += pieces
    else if (approval.status === 'submitted') row.submitted += pieces

    map.set(approval.product_id, row)
  }

  return map
})

// the Calendar's list: today and later, plus earlier ones not finished;
// oldest date first
const inspectionRows = computed(() => {
  const today = todayKey.value

  return products.value
    .filter((product) => product.inspection_date)
    .map((product) => {
      const date = String(product.inspection_date).slice(0, 10)
      // batch size, fixed when the inspection was scheduled
      const qty = Number(product.inspection_qty ?? product.quantity ?? 0)
      const approved = Number(product.approved_count || 0) + Number(product.return_count || 0)
      const { saved = 0, submitted = 0 } = pendingByProduct.value.get(product.id) || {}
      const done = approved + saved + submitted

      const pct = (value) => (qty > 0 ? (value / qty) * 100 : 0)
      const approvedPct = Math.min(pct(approved), 100)
      const savedPct = Math.min(pct(saved), 100 - approvedPct)
      const submittedPct = Math.min(pct(submitted), 100 - approvedPct - savedPct)

      return {
        item: product,
        date,
        qty,
        approved,
        saved,
        submitted,
        done,
        remaining: Math.max(qty - done, 0),
        approvedPct,
        savedPct,
        submittedPct,
        isToday: date === today,
        overdue: date < today && done < qty,
      }
    })
    .filter((row) => row.date >= today || row.done < row.qty)
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.item.name || '').localeCompare(String(b.item.name || '')))
})

// today's and overdue ones still to count
const dueNow = computed(() => inspectionRows.value.filter((row) => row.date <= todayKey.value && row.remaining > 0))
const overdue = computed(() => inspectionRows.value.filter((row) => row.overdue))
const dueToday = computed(() => dueNow.value.filter((row) => row.isToday))
const piecesDue = computed(() => dueNow.value.reduce((sum, row) => sum + row.remaining, 0))

// after today, up to a week ahead
const upcomingWeek = computed(() => {
  const weekAhead = dayKey(startOfDay(now.value, 7))
  return inspectionRows.value.filter((row) => row.date > todayKey.value && row.date <= weekAhead && row.remaining > 0)
})

const nextUp = computed(
  () => inspectionRows.value.find((row) => row.date > todayKey.value && row.remaining > 0) || null
)

// one word per row: the most important thing about it
function rowStatus(row) {
  if (row.qty > 0 && row.approved >= row.qty) {
    return { label: 'Done', icon: 'check', tone: 'bg-emerald-600/15 text-emerald-400' }
  }
  if (row.overdue) return { label: 'Overdue', icon: 'alert', tone: 'bg-red-600/15 text-red-400' }
  // all counted, waiting: on you to submit, or on the owner to approve
  if (row.remaining === 0) {
    return row.saved > 0
      ? { label: 'Saved', icon: '', tone: 'bg-lime-400/15 text-lime-400' }
      : { label: 'Submitted', icon: '', tone: 'bg-sky-500/15 text-sky-300' }
  }
  if (row.isToday) return { label: 'Today', icon: '', tone: 'bg-yellow-500/15 text-yellow-400' }
  if (row.done > 0) return { label: 'In progress', icon: '', tone: 'bg-sky-500/15 text-sky-300' }
  return { label: 'Upcoming', icon: '', tone: 'bg-white/5 text-zinc-300' }
}

function piecesOf(list) {
  return list.reduce((sum, item) => sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0), 0)
}

const submitted = computed(() => approvals.value.filter((item) => item.status === 'submitted'))
const submittedPieces = computed(() => piecesOf(submitted.value))
const savedPieces = computed(() => piecesOf(approvals.value.filter((item) => item.status === 'saved')))

// your own saved inspections: the owner sees them only once submitted
const mySaved = computed(() => approvals.value.filter((item) => item.status === 'saved' && isMine(item)))

// newest first
function newerFirst(a, b) {
  if (a.created_at && b.created_at) return new Date(b.created_at) - new Date(a.created_at)
  return (Number(b.id) || 0) - (Number(a.id) || 0)
}

const recentWork = computed(() => [...approvals.value].sort(newerFirst).slice(0, 5))

/* ------------------------------------------------------------------
   Deliveries (the Calendar's Delivery tab), soonest first
------------------------------------------------------------------ */
const deliveryRows = computed(() =>
  deliveries.value
    .map((delivery) => {
      const date = delivery.delivery_date ? String(delivery.delivery_date).slice(0, 10) : ''
      return { ...delivery, date, overdue: Boolean(date) && date < todayKey.value, isToday: date === todayKey.value }
    })
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
)

const deliveriesOverdue = computed(() => deliveryRows.value.filter((delivery) => delivery.overdue))
const deliveriesToday = computed(() => deliveryRows.value.filter((delivery) => delivery.isToday))

function deliveryStatus(delivery) {
  if (delivery.overdue) return { label: 'Overdue', icon: 'alert', tone: 'bg-red-600/15 text-red-400' }
  if (delivery.isToday) return { label: 'Today', icon: '', tone: 'bg-yellow-500/15 text-yellow-400' }
  return { label: 'Upcoming', icon: '', tone: 'bg-white/5 text-zinc-300' }
}

/* ------------------------------------------------------------------
   Stock (what "low" means: lib/stock.js)
------------------------------------------------------------------ */
// emptiest first
const lowStock = computed(() => products.value.filter(isLowStock).sort(byStockLevel))
const outOfStock = computed(() => lowStock.value.filter(isOutOfStock))
const lowStockList = computed(() => lowStock.value.slice(0, 6))

/* ------------------------------------------------------------------
   Needs your attention
------------------------------------------------------------------ */
// red = something is late or empty, amber = soon, grey = a task for you
const TONES = {
  critical: 'bg-red-600/15 text-red-400',
  warning: 'bg-yellow-500/15 text-yellow-400',
  task: 'bg-white/5 text-zinc-300',
}

// most urgent first; only what has something in it
const attention = computed(() => {
  const lowOnly = lowStock.value.length - outOfStock.value.length

  return [
    { key: 'overdue', n: overdue.value.length, label: (n) => `${noun(n, 'inspection')} overdue`, to: CALENDAR, icon: 'alert', tone: 'critical' },
    { key: 'late', n: deliveriesOverdue.value.length, label: (n) => `${noun(n, 'delivery', 'deliveries')} overdue`, to: DELIVERIES, icon: 'alert', tone: 'critical' },
    { key: 'out', n: outOfStock.value.length, label: (n) => `${noun(n, 'product')} out of stock`, to: LOW_STOCK_LINK, icon: 'alert', tone: 'critical' },
    { key: 'today', n: dueToday.value.length, label: (n) => `${noun(n, 'inspection')} to do today`, to: CALENDAR, icon: 'calendar', tone: 'warning' },
    { key: 'saved', n: mySaved.value.length, label: (n) => `saved ${noun(n, 'inspection')} to submit`, to: CALENDAR, icon: 'approval', tone: 'task' },
    { key: 'arriving', n: deliveriesToday.value.length, label: (n) => `${noun(n, 'delivery', 'deliveries')} arriving today`, to: DELIVERIES, icon: 'inventory', tone: 'task' },
    { key: 'low', n: lowOnly, label: (n) => `${noun(n, 'product')} running low`, to: LOW_STOCK_LINK, icon: 'inventory', tone: 'warning' },
  ]
    .filter((item) => item.n > 0)
    .map((item) => ({ ...item, label: item.label(item.n) }))
})
</script>

<style scoped src="../../styles/dashboard.css"></style>
