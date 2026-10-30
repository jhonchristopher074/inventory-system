<script setup>
// Sales History (admin): a chart of sales over the chosen period and the
// best-selling products. Both use exactly the sales shown in the list
// (date filter + cashier), so everything on the page agrees.
//
//   <SalesInsights :sales="filteredSales" :range="range" />
import { computed, ref, watch } from 'vue'
import { count, niceTop, peso, pesoShort } from '../lib/format'

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
  return peso(value)
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

  // show about 8 labels under the chart, whatever the number of points
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8))

  // The line: one point per day (or month), in the middle of its column,
  // drawn on a 100 × 100 box that stretches to the chart's size.
  const top = niceTop(max)
  const n = buckets.length
  for (const [i, b] of buckets.entries()) {
    b.pct = (b.total / top) * 100
    b.x = ((i + 0.5) / n) * 100
  }

  const points = buckets.map((b) => `${b.x},${100 - b.pct}`)
  const line = `M${points.join('L')}`
  const area = `M${buckets[0].x},100L${points.join('L')}L${buckets[n - 1].x},100Z`

  return {
    buckets,
    best,
    byMonth,
    labelEvery,
    line,
    area,
    lines: [top, top / 2, 0], // the scale: top, middle, bottom
    showDots: n <= 14, // a dot on every point only while they aren't crowded
  }
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
        <div class="flex gap-2">
          <!-- the scale: three clean amounts, with faint lines across -->
          <div class="relative h-44 w-12 shrink-0 text-right text-[11px] tabular-nums text-zinc-500" aria-hidden="true">
            <span
              v-for="(line, i) in chart.lines"
              :key="line"
              class="absolute right-0 -translate-y-1/2 leading-none"
              :style="{ top: `${i * 50}%` }"
            >
              {{ pesoShort(line) }}
            </span>
          </div>

          <div class="relative h-44 min-w-0 flex-1">
            <div
              v-for="(line, i) in chart.lines"
              :key="line"
              class="absolute inset-x-0 border-t"
              :class="i === chart.lines.length - 1 ? 'border-white/15' : 'border-white/5'"
              :style="{ top: `${i * 50}%` }"
              aria-hidden="true"
            ></div>

            <!-- the line, with a faint wash under it -->
            <svg
              class="absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path :d="chart.area" class="fill-red-500/10" />
              <path
                :d="chart.line"
                fill="none"
                class="stroke-red-500"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
                vector-effect="non-scaling-stroke"
              />
            </svg>

            <!-- one strip per day (or month): hover or Tab to it for its
                 total; a thin line marks the day -->
            <ul class="absolute inset-0 flex" :aria-label="`Sales per ${chart.byMonth ? 'month' : 'day'}`">
              <li
                v-for="(bucket, i) in chart.buckets"
                :key="bucket.key"
                class="group relative h-full min-w-0 flex-1 outline-none"
                tabindex="0"
                :aria-label="`${bucket.label}: ${money(bucket.total)}, ${count(bucket.count)} sale${bucket.count === 1 ? '' : 's'}`"
              >
                <div class="absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-white/20 group-hover:block group-focus-visible:block"></div>

                <div
                  class="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-red-500 ring-2 ring-zinc-900"
                  :class="chart.showDots ? '' : 'hidden group-hover:block group-focus-visible:block'"
                  :style="{ bottom: `${bucket.pct}%` }"
                ></div>

                <div
                  class="pointer-events-none absolute z-10 hidden whitespace-nowrap rounded-[10px] bg-black px-2.5 py-1.5 text-xs shadow-xl ring-1 ring-white/10 group-hover:block group-focus-visible:block"
                  :class="i < chart.buckets.length / 5 ? 'left-0' : i >= (chart.buckets.length * 4) / 5 ? 'right-0' : 'left-1/2 -translate-x-1/2'"
                  :style="{ bottom: `calc(${bucket.pct}% + 14px)` }"
                >
                  <p class="font-bold text-white">{{ money(bucket.total) }}</p>
                  <p class="text-zinc-400">{{ bucket.label }} · {{ count(bucket.count) }} sale{{ bucket.count === 1 ? '' : 's' }}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div class="mt-2 flex pl-14 text-[10px] text-zinc-500" aria-hidden="true">
          <span
            v-for="(bucket, i) in chart.buckets"
            :key="bucket.key"
            class="flex min-w-0 flex-1 justify-center whitespace-nowrap"
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
            <span class="w-14 shrink-0 text-right text-xs text-zinc-500">{{ count(product.quantity) }} pcs</span>
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
