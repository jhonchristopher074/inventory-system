<script setup>
// Sales History (admin): a chart of sales over the chosen period and the
// best-selling products. Both use exactly the sales shown in the list
// (date filter + cashier), so everything on the page agrees.
//
//   <SalesInsights :sales="filteredSales" :range="range" />
import { computed, ref, watch } from 'vue'

const props = defineProps({
  sales: { type: Array, required: true },
  range: { type: Object, default: () => ({ start: null, end: null }) },
})

// Hidden until opened (it takes a lot of room); the choice is remembered.
const STORAGE_KEY = 'salesInsightsOpen'
const open = ref(false)
try {
  open.value = localStorage.getItem(STORAGE_KEY) === '1'
} catch {
  // storage off: starts closed
}
watch(open, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // ignore
  }
})

// best sellers: top 5, or all 10 after 'Show top 10'
const showAllProducts = ref(false)

const MAX_DAY_BARS = 62 // longer periods are shown per month

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function money(value) {
  return '₱' + Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ----- Chart: one bar per day (or per month for long periods) -----
const chart = computed(() => {
  if (props.sales.length === 0) return null

  const dates = props.sales.map((s) => new Date(s.created_at))
  const first = props.range.start || new Date(Math.min(...dates))
  const lastDay = props.range.end
    ? new Date(props.range.end.getFullYear(), props.range.end.getMonth(), props.range.end.getDate() - 1)
    : new Date()

  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate())
  const days = Math.round((lastDay - start) / 86400000) + 1
  const byMonth = days > MAX_DAY_BARS

  // every day / month of the period, also the ones without sales
  const buckets = []
  if (byMonth) {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= lastDay; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({ key: monthKey(d), label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), total: 0, count: 0 })
    }
  } else {
    for (let d = new Date(start); d <= lastDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      buckets.push({ key: dayKey(d), label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), total: 0, count: 0 })
    }
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const sale of props.sales) {
    const d = new Date(sale.created_at)
    const i = index.get(byMonth ? monthKey(d) : dayKey(d))
    if (i === undefined) continue
    buckets[i].total += Number(sale.total_amount || 0)
    buckets[i].count += 1
  }

  const max = Math.max(...buckets.map((b) => b.total), 0)
  const best = buckets.reduce((a, b) => (b.total > a.total ? b : a), buckets[0])

  // show about 8 labels under the bars, whatever the number of bars
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8))

  return { buckets, max, best, byMonth, labelEvery }
})

// ----- Best-selling products -----
const topProducts = computed(() => {
  const products = new Map()

  for (const sale of props.sales) {
    for (const item of sale.sale_items || []) {
      const name = item.product_name || 'Unknown product'
      const row = products.get(name) || { name, quantity: 0, total: 0 }
      row.quantity += Number(item.quantity || 0)
      row.total += Number(item.subtotal ?? Number(item.price || 0) * Number(item.quantity || 0))
      products.set(name, row)
    }
  }

  const list = [...products.values()].sort((a, b) => b.total - a.total).slice(0, 10)
  const max = Math.max(...list.map((p) => p.total), 0)

  return list.map((p) => ({ ...p, share: max ? (p.total / max) * 100 : 0 }))
})

const shownProducts = computed(() =>
  showAllProducts.value ? topProducts.value : topProducts.value.slice(0, 5)
)
</script>

<template>
  <div class="mb-6">
  <button
    class="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-800"
    :aria-expanded="open"
    @click="open = !open"
  >
    {{ open ? 'Hide chart & best sellers' : 'Show chart & best sellers' }}
    <span class="text-xs text-zinc-400 transition" :class="open ? 'rotate-180' : ''" aria-hidden="true">▼</span>
  </button>

  <div v-if="open" class="mt-3 grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <!-- SALES OVER TIME -->
    <section class="min-w-0 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-bold text-white">
          Sales per {{ chart?.byMonth ? 'month' : 'day' }}
        </h2>
        <p v-if="chart && chart.best.total > 0" class="text-xs text-zinc-400">
          Best: <span class="font-bold text-white">{{ chart.best.label }}</span> · {{ money(chart.best.total) }}
        </p>
      </div>

      <p v-if="!chart" class="py-10 text-center text-sm text-zinc-500">No sales to show.</p>

      <div v-else>
        <!-- hover (or tap) a bar for its day's total -->
        <div class="flex h-44 items-end gap-[2px] border-b border-white/10" role="img" :aria-label="`Sales per ${chart.byMonth ? 'month' : 'day'}`">
          <div
            v-for="bucket in chart.buckets"
            :key="bucket.key"
            class="group relative flex h-full min-w-0 flex-1 items-end"
          >
            <div
              class="w-full rounded-t-sm transition"
              :class="bucket.total > 0 ? 'bg-red-500 group-hover:bg-red-400' : 'bg-zinc-800'"
              :style="{ height: chart.max ? Math.max((bucket.total / chart.max) * 100, bucket.total > 0 ? 2 : 1) + '%' : '1%' }"
            ></div>

            <div
              class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-black px-2.5 py-1.5 text-xs text-white shadow-xl ring-1 ring-white/10 group-hover:block"
            >
              <span class="font-bold">{{ bucket.label }}</span><br />
              {{ money(bucket.total) }} · {{ bucket.count }} sale{{ bucket.count === 1 ? '' : 's' }}
            </div>
          </div>
        </div>

        <div class="mt-1.5 flex gap-[2px] text-[10px] text-zinc-500">
          <span
            v-for="(bucket, i) in chart.buckets"
            :key="bucket.key"
            class="min-w-0 flex-1 overflow-visible whitespace-nowrap"
          >
            {{ i % chart.labelEvery === 0 ? bucket.label : '' }}
          </span>
        </div>
      </div>
    </section>

    <!-- BEST-SELLING PRODUCTS -->
    <section class="min-w-0 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <h2 class="mb-4 text-lg font-bold text-white">Best-selling products</h2>

      <p v-if="topProducts.length === 0" class="py-10 text-center text-sm text-zinc-500">
        No products sold.
      </p>

      <ol v-else class="space-y-2.5">
        <li v-for="(product, i) in shownProducts" :key="product.name" class="text-sm">
          <div class="flex items-baseline justify-between gap-3">
            <span class="min-w-0 truncate text-zinc-200">
              <span class="mr-1.5 text-zinc-500">{{ i + 1 }}.</span>{{ product.name }}
            </span>
            <span class="shrink-0 font-bold text-white">{{ money(product.total) }}</span>
          </div>
          <div class="mt-1 flex items-center gap-2">
            <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div class="h-full rounded-full bg-red-500" :style="{ width: product.share + '%' }"></div>
            </div>
            <span class="w-14 shrink-0 text-right text-xs text-zinc-500">{{ product.quantity }} pcs</span>
          </div>
        </li>
      </ol>

      <button
        v-if="topProducts.length > 5"
        class="mt-3 text-sm font-bold text-zinc-400 hover:text-white"
        @click="showAllProducts = !showAllProducts"
      >
        {{ showAllProducts ? 'Show top 5' : 'Show top 10' }}
      </button>
    </section>
  </div>
  </div>
</template>
