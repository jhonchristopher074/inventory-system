<script setup>
// Sales History: a chart of sales over the chosen period and the
// best-selling products, of exactly the sales shown in the list (period,
// cashier, search), so everything on the page agrees. The numbers come
// worked out (lib/salesQuery.js salesSummary), not as every sale:
//
//   <SalesInsights :days="summary.days" :top="summary.top" :first-sale="summary.firstSale" :range="range" />
import { computed } from 'vue'
import { count, peso } from '../lib/format'
import SalesLineChart from './SalesLineChart.vue'

const props = defineProps({
  // [{ day: 'YYYY-MM-DD', total, count }]: the days with sales
  days: { type: Array, required: true },
  // the 5 best selling: [{ name, quantity, total }]
  top: { type: Array, required: true },
  // the first sale shown: where an "All" chart starts
  firstSale: { type: Date, default: null },
  range: { type: Object, default: () => ({ start: null, end: null }) },
})

const MAX_DAY_POINTS = 62 // longer periods are shown per month

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function money(value) {
  return peso(value)
}

// ----- Chart: one point per day (or per month for long periods) -----
const chart = computed(() => {
  if (props.days.length === 0) return null

  const first = props.range.start || props.firstSale || new Date()
  const lastDay = props.range.end
    ? new Date(props.range.end.getFullYear(), props.range.end.getMonth(), props.range.end.getDate() - 1)
    : new Date()

  const start = new Date(first.getFullYear(), first.getMonth(), first.getDate())
  const days = Math.round((lastDay - start) / 86400000) + 1
  const byMonth = days > MAX_DAY_POINTS

  // every day / month of the period, also the ones without sales
  const buckets = []
  const todayKey = dayKey(new Date())
  const thisMonth = monthKey(new Date())

  if (byMonth) {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= lastDay; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      buckets.push({
        key: monthKey(d),
        label: d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
        title: d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        current: monthKey(d) === thisMonth,
        total: 0,
        count: 0,
      })
    }
  } else {
    for (let d = new Date(start); d <= lastDay; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      buckets.push({
        key: dayKey(d),
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        title: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        current: dayKey(d) === todayKey,
        total: 0,
        count: 0,
      })
    }
  }

  const index = new Map(buckets.map((b, i) => [b.key, i]))
  for (const day of props.days) {
    const i = index.get(byMonth ? day.day.slice(0, 7) : day.day)
    if (i === undefined) continue
    buckets[i].total += Number(day.total || 0)
    buckets[i].count += Number(day.count || 0)
  }

  const best = buckets.reduce((a, b) => (b.total > a.total ? b : a), buckets[0])

  return { buckets, best, byMonth }
})

// ----- Best-selling products -----
const topProducts = computed(() => {
  // the top 5 (the same as the Dashboard and the PDF / Excel downloads)
  const list = props.top.slice(0, 5)
  const max = Math.max(...list.map((p) => p.total), 0)

  return list.map((p) => ({ ...p, share: max ? (p.total / max) * 100 : 0 }))
})

</script>

<template>
  <div class="mb-6">
  <!-- the two cards are the same height; the chart fills its card -->
  <div class="grid items-stretch gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <!-- SALES OVER TIME -->
    <section class="flex min-w-0 flex-col rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-bold text-white">
          Sales per {{ chart?.byMonth ? 'month' : 'day' }}
        </h2>
        <p v-if="chart && chart.best.total > 0" class="text-xs text-zinc-400">
          Best: <span class="font-bold text-white">{{ chart.best.label }}</span> · {{ money(chart.best.total) }}
        </p>
      </div>

      <p v-if="!chart" class="py-10 text-center text-sm text-zinc-500">No sales to show.</p>

      <SalesLineChart
        v-else
        class="min-h-0 flex-1"
        :points="chart.buckets"
        :name="`Sales per ${chart.byMonth ? 'month' : 'day'}`"
        empty-text="No sales in this period."
      />
    </section>

    <!-- BEST-SELLING PRODUCTS -->
    <section class="min-w-0 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <h2 class="mb-4 text-lg font-bold text-white">Top selling products</h2>

      <p v-if="topProducts.length === 0" class="py-10 text-center text-sm text-zinc-500">
        No products sold.
      </p>

      <ol v-else class="space-y-2.5">
        <li v-for="(product, i) in topProducts" :key="product.name" class="text-sm">
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

    </section>
  </div>
  </div>
</template>
