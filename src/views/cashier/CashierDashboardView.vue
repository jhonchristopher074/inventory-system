<template>
  <!-- Built like the Owner's Dashboard (same tiles and cards: styles/dashboard.css),
       with the cashier's own sales. @container: the layout follows the width
       of the page area (the sidebar takes part of the window). -->
  <div class="@container">
    <PageHeader title="Dashboard" :subtitle="`${todayLong} · Your sales and the stock you sell.`">
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
          to="/cashier/pos"
          class="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"
        >
          <NavIcon name="pos" class="h-4 w-4" />
          Open POS
        </RouterLink>
      </div>
    </PageHeader>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
      {{ errorMessage }}
    </p>

    <!-- while refreshing, the numbers stay where they are (dimmed) -->
    <div class="transition-opacity" :class="{ 'opacity-60': refreshing && loaded }">
      <!-- ============================================================
           AT A GLANCE: your sales today is the big number
      ============================================================ -->
      <section class="mb-5 grid grid-cols-2 gap-3 @min-[900px]:grid-cols-5" aria-label="At a glance">
        <RouterLink to="/cashier/sales" class="kpi col-span-2">
          <div class="kpi-top">
            <p class="kpi-label">Your sales today</p>
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

        <RouterLink to="/cashier/sales" class="kpi col-span-2 @min-[900px]:col-span-1">
          <div class="kpi-top">
            <p class="kpi-label">This month</p>
            <span class="kpi-icon"><NavIcon name="calendar" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value" :title="peso(month.total)">{{ loaded ? pesoTile(month.total) : '—' }}</p>
          <p class="kpi-sub">{{ salesText(month.count) }} in {{ monthName }}</p>
        </RouterLink>

        <!-- stock: to tell customers what's running out (nothing to open:
             a cashier has no Inventory page) -->
        <div class="kpi">
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
        </div>

        <div class="kpi">
          <div class="kpi-top">
            <p class="kpi-label">Ready to sell</p>
            <span class="kpi-icon"><NavIcon name="check" class="h-4 w-4" /></span>
          </div>

          <p class="kpi-value">{{ loaded ? count(inStock.length) : '—' }}</p>
          <p class="kpi-sub">products in stock</p>
        </div>
      </section>

      <!-- ============================================================
           YOUR WEEK + YOUR LATEST SALES
      ============================================================ -->
      <section class="mb-5 grid gap-5 @min-[1000px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <!-- the chart grows to the height of the card beside it -->
        <div class="card flex flex-col p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Your sales</p>
              <h2 class="card-title">Last 7 days</h2>
            </div>

            <div class="text-right">
              <p class="text-xl font-extrabold text-white">{{ peso(weekTotal) }}</p>
              <p class="text-xs text-zinc-400">{{ salesText(weekCount) }}</p>
            </div>
          </div>

          <p v-if="bestDay" class="-mt-2 mb-4 text-xs text-zinc-400">
            Best day: <b class="whitespace-nowrap text-white">{{ bestDay.title }}</b> ·
            <span class="whitespace-nowrap">{{ peso(bestDay.total) }}</span>
          </p>

          <SalesLineChart
            :points="weekDays"
            name="Your sales of the last 7 days"
            empty-text="No sales in the last 7 days."
            class="min-h-0 flex-1"
          />

          <RouterLink to="/cashier/sales" class="card-link mt-4">
            Open Sales History <NavIcon name="chevron" class="h-4 w-4" />
          </RouterLink>
        </div>

        <div class="card flex flex-col p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Your sales</p>
              <h2 class="card-title">Recent sales</h2>
            </div>
            <RouterLink to="/cashier/sales" class="card-link">
              See all <NavIcon name="chevron" class="h-4 w-4" />
            </RouterLink>
          </div>

          <ul v-if="recentSales.length > 0" class="divide-y divide-white/5">
            <li v-for="sale in recentSales" :key="sale.id" class="flex items-center gap-3 py-2.5">
              <span class="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-white/5 text-zinc-400">
                <NavIcon name="pos" class="h-5 w-5" />
              </span>

              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-bold text-white">
                  Sale #{{ sale.id }}
                  <span class="font-normal text-zinc-500">· {{ dayAndTime(sale.created_at, now) }}</span>
                </p>
                <p class="truncate text-xs text-zinc-500">{{ itemsText(sale) }}</p>
              </div>

              <p class="shrink-0 text-sm font-extrabold text-white">{{ peso(sale.total_amount) }}</p>
            </li>
          </ul>

          <div
            v-else-if="loaded"
            class="flex flex-1 flex-col items-center justify-center gap-3 rounded-2xl bg-black/20 p-6 text-center"
          >
            <p class="text-sm text-zinc-400">No recent sales yet.</p>
            <RouterLink to="/cashier/pos" class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
              Make a sale
            </RouterLink>
          </div>

          <p v-else class="text-sm text-zinc-500">Loading…</p>
        </div>
      </section>

      <!-- ============================================================
           STOCK RUNNING LOW · YOUR BEST SELLERS
      ============================================================ -->
      <section class="grid gap-5 @min-[700px]:grid-cols-2">
        <div class="card p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Stock</p>
              <h2 class="card-title">Running low</h2>
            </div>
            <RouterLink to="/cashier/pos" class="card-link">
              POS <NavIcon name="chevron" class="h-4 w-4" />
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

          <p v-if="lowStock.length > lowStockList.length" class="mt-2 text-xs text-zinc-500">
            and {{ count(lowStock.length - lowStockList.length) }} more
          </p>
        </div>

        <div class="card p-5">
          <div class="card-head">
            <div>
              <p class="eyebrow">Your last 30 days</p>
              <h2 class="card-title">Best sellers</h2>
            </div>
            <RouterLink to="/cashier/sales" class="card-link">
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
import { count, dayAndTime, peso } from '../../lib/format'
import { LOW_STOCK, byStockLevel, isLowStock, isOutOfStock, stockOf } from '../../lib/stock'
import {
  bestDay as findBestDay,
  bestSellers as topSellers,
  changeSinceYesterday,
  dailyTotals,
  pesoTile,
  salesText,
  salesThisMonth,
  salesToday,
  startOfDay,
} from '../../lib/dashboardStats'

const products = ref([])
const sales = ref([]) // this cashier's own sales only (list_my_sales_since)

const loaded = ref(false)
const refreshing = ref(false)
const errorMessage = ref('')
const updatedAt = ref(null)

// The moment the numbers are for. Set on every load, so a dashboard left
// open overnight moves to the new day when it refreshes.
const now = ref(new Date())

/* ------------------------------------------------------------------
   Loading: your sales far enough back for this month, yesterday and the
   last 30 days, and the products (for stock and best sellers' pictures).
------------------------------------------------------------------ */
async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data || []
}

async function load() {
  if (refreshing.value) return
  refreshing.value = true

  const at = new Date()
  const since = new Date(Math.min(new Date(at.getFullYear(), at.getMonth(), 1), startOfDay(at, -29)))

  const [salesResult, productsResult] = await Promise.allSettled([
    rpc('list_my_sales_since', { p_since: since.toISOString() }),
    rpc('list_products', { p_filter: 'active', p_order_by: 'id_asc' }),
  ])

  const problems = []

  if (salesResult.status === 'fulfilled') sales.value = salesResult.value
  else problems.push(`your sales (${salesResult.reason?.message || salesResult.reason})`)

  if (productsResult.status === 'fulfilled') products.value = productsResult.value
  else problems.push(`the products (${productsResult.reason?.message || productsResult.reason})`)

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
   Dates
------------------------------------------------------------------ */
const todayLong = computed(() =>
  now.value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)

const monthName = computed(() => now.value.toLocaleDateString(undefined, { month: 'long' }))

const updatedText = computed(() =>
  updatedAt.value ? updatedAt.value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''
)

/* ------------------------------------------------------------------
   Your sales (the sums: lib/dashboardStats.js, the same as the Owner's)
------------------------------------------------------------------ */
const today = computed(() => salesToday(sales.value, now.value))
const todayChange = computed(() => changeSinceYesterday(sales.value, now.value))
const month = computed(() => salesThisMonth(sales.value, now.value))

const weekDays = computed(() => dailyTotals(sales.value, now.value, 7))
const weekTotal = computed(() => weekDays.value.reduce((sum, day) => sum + day.total, 0))
const weekCount = computed(() => weekDays.value.reduce((sum, day) => sum + day.count, 0))
const bestDay = computed(() => findBestDay(weekDays.value))

const bestSellers = computed(() => topSellers(sales.value, products.value, now.value))

// your 5 latest sales, newest first
const recentSales = computed(() =>
  [...sales.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
)

// "Plywood ×2, GI Wire ×1 +2 more"
function itemsText(sale) {
  const items = sale.sale_items || []
  if (items.length === 0) return 'No items'

  const shown = items.slice(0, 2).map((item) => `${item.product_name || 'Item'} ×${count(item.quantity)}`)
  const more = items.length - shown.length

  return more > 0 ? `${shown.join(', ')} +${more} more` : shown.join(', ')
}

/* ------------------------------------------------------------------
   Stock (what "low" means: lib/stock.js)
------------------------------------------------------------------ */
// emptiest first
const lowStock = computed(() => products.value.filter(isLowStock).sort(byStockLevel))
const outOfStock = computed(() => lowStock.value.filter(isOutOfStock))
const lowStockList = computed(() => lowStock.value.slice(0, 6))
const inStock = computed(() => products.value.filter((product) => !isOutOfStock(product)))
</script>

<style scoped src="../../styles/dashboard.css"></style>
