<template>
  <div>
    <PageHeader
      title="Sales History"
      subtitle="Every sale, receipt and refund, by period and cashier."
    />

    <!-- ONE ROW: Sales | Refunds, the period (All, Today, …) and the
         PDF / Excel downloads, so the numbers start higher up.
         ?view=refunds keeps Refunds on a refresh (the bell opens it).
         Refunds: components/RefundApprovals.vue -->
    <div class="mb-4 flex flex-wrap items-start gap-3">
    <div class="inline-flex max-w-full shrink-0 gap-1 rounded-2xl border border-white/5 bg-zinc-900 p-1">
      <button
        v-for="tab in VIEW_TABS"
        :key="tab.key"
        type="button"
        class="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-bold transition"
        :class="view === tab.key ? 'bg-red-600 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'"
        :aria-pressed="view === tab.key"
        @click="view = tab.key"
      >
        {{ tab.label }}
        <span
          v-if="tab.key === 'refunds' && refundsWaiting > 0"
          class="grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.7rem] font-extrabold"
          :class="view === tab.key ? 'bg-white text-red-600' : 'bg-red-600 text-white'"
        >
          {{ count(refundsWaiting) }}
        </span>
      </button>
    </div>

      <template v-if="view === 'sales'">
        <SalesPeriodFilter v-model="range" class="!mb-0 min-w-0 flex-1" />

        <!-- download what's shown: a PDF to read or print, Excel with every detail -->
        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            class="export-btn"
            :disabled="filteredSales.length === 0 || exporting !== ''"
            title="The sales shown, and the top selling products, easy to read and print"
            @click="exportFile('pdf')"
          >
            <NavIcon name="download" class="h-4 w-4" />
            {{ exporting === 'pdf' ? 'Making PDF…' : 'PDF' }}
          </button>
          <button
            type="button"
            class="export-btn"
            :disabled="filteredSales.length === 0 || exporting !== ''"
            title="The sales shown in Excel: totals, top selling products, per cashier and per day, every sale, every product sold"
            @click="exportFile('excel')"
          >
            <NavIcon name="download" class="h-4 w-4" />
            {{ exporting === 'excel' ? 'Making Excel…' : 'Excel' }}
          </button>
        </div>
      </template>
    </div>

    <!-- REFUNDS: how much went back, then the list -->
    <div v-if="view === 'refunds'" class="mb-4 grid gap-3 sm:grid-cols-2">
      <div class="kpi tone-amber">
        <div class="kpi-top">
          <p class="kpi-label">Refunded · last 7 days</p>
          <span class="kpi-icon"><NavIcon name="restore" class="h-4 w-4" /></span>
        </div>
        <p class="kpi-value" :title="peso(refundsWeek.amount)">{{ peso(refundsWeek.amount) }}</p>
        <p class="kpi-sub">
          {{ refundsWeek.count ? `${count(refundsWeek.count)} refund${refundsWeek.count === 1 ? '' : 's'}` : 'No refunds' }}
        </p>
      </div>

      <div class="kpi tone-amber">
        <div class="kpi-top">
          <p class="kpi-label">Refunded · all time</p>
          <span class="kpi-icon"><NavIcon name="restore" class="h-4 w-4" /></span>
        </div>
        <p class="kpi-value" :title="peso(refundsAll.amount)">{{ peso(refundsAll.amount) }}</p>
        <p class="kpi-sub">
          {{ refundsAll.sales ? `on ${count(refundsAll.sales)} sale${refundsAll.sales === 1 ? '' : 's'}` : 'No refunds' }}
        </p>
      </div>
    </div>

    <RefundApprovals
      v-if="view === 'refunds'"
      :refunds="refunds"
      :ready="refundsReady"
      @changed="fetchRefunds"
    />

    <template v-else>
      <!-- one cashier picked: a chip to clear it -->
      <div v-if="selectedCashier" class="mb-4 flex flex-wrap items-center gap-2.5 text-sm font-semibold text-zinc-300">
        Showing the sales of
        <span class="inline-flex items-center gap-2 rounded-full border border-red-500 bg-red-600/25 py-1 pl-1 pr-1.5 shadow-[0_0_0_3px_rgba(224,27,50,0.15)]">
          <span class="grid h-7 w-7 place-items-center rounded-full bg-red-600 text-[0.65rem] font-extrabold text-white" aria-hidden="true">{{ selectedCashier.initials }}</span>
          <b class="text-base text-white">{{ selectedCashier.name }}</b>
          <button
            type="button"
            class="grid h-6 w-6 place-items-center rounded-full bg-black/25 text-white hover:bg-red-600"
            aria-label="Show every cashier"
            title="Show every cashier"
            @click="setCashier('')"
          >
            ✕
          </button>
        </span>
      </div>

      <!-- SUMMARY of what's shown (refunds: on the Refunds tab) -->
      <div class="mb-4 grid gap-3 sm:grid-cols-3">
        <div class="kpi tone-red">
          <div class="kpi-top">
            <p class="kpi-label">Net sales</p>
            <span class="kpi-icon"><NavIcon name="sales" class="h-4 w-4" /></span>
          </div>
          <p class="kpi-value" :title="peso(summary.net)">{{ peso(summary.net) }}</p>
          <p v-if="change" class="kpi-change" :class="change.up ? 'text-emerald-400' : 'text-red-400'">
            <NavIcon :name="change.up ? 'up' : 'down'" class="h-3.5 w-3.5" />
            {{ change.text }}
          </p>
          <p v-else class="kpi-sub">After refunds</p>
        </div>

        <div class="kpi tone-blue">
          <div class="kpi-top">
            <p class="kpi-label">Transactions</p>
            <span class="kpi-icon"><NavIcon name="pos" class="h-4 w-4" /></span>
          </div>
          <p class="kpi-value">{{ count(summary.count) }}</p>
          <p class="kpi-sub">Avg. {{ peso(summary.average) }} a sale</p>
        </div>

        <div class="kpi tone-green">
          <div class="kpi-top">
            <p class="kpi-label">Items sold</p>
            <span class="kpi-icon"><NavIcon name="inventory" class="h-4 w-4" /></span>
          </div>
          <p class="kpi-value">{{ count(summary.items) }}<span class="kpi-unit"> pcs</span></p>
          <p class="kpi-sub">{{ count(summary.products) }} different products</p>
        </div>

      </div>

      <!-- CHART + TOP SELLING of what's shown -->
      <SalesInsights :sales="filteredSales" :range="range" />

      <p v-if="exportError" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
        {{ exportError }}
      </p>

      <!-- TABLE: 10, 15 or all sales a page -->
      <div ref="tableTop" class="card scroll-mt-4 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
          <h2 class="font-bold text-white">
            Transactions
            <span class="ml-1 text-sm font-semibold text-zinc-500">{{ count(filteredSales.length) }}</span>
          </h2>
          <!-- search and cashier: the table's own tools -->
          <div class="flex w-full gap-2 sm:w-auto">
            <input
              v-model="search"
              type="search"
              maxlength="80"
              placeholder="Search sale, cashier, product"
              aria-label="Search sales"
              class="filter-box min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            <select
              :value="cashierFilter"
              class="filter-box w-[8.5rem] shrink-0 sm:w-40"
              :class="{ 'is-picked': cashierFilter }"
              aria-label="Cashier"
              @change="setCashier($event.target.value)"
            >
              <option value="">All cashiers</option>
              <option v-for="option in cashierOptions" :key="option.key" :value="option.key">
                {{ option.name }}
              </option>
            </select>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="data-table resp-table fixed-cols">
            <colgroup>
              <col class="w-[6rem]" />
              <col class="w-[11rem]" />
              <col class="w-[13rem]" />
              <col />
              <col class="w-[9rem]" />
              <col class="w-[9.5rem]" />
              <col class="w-[6.5rem]" />
            </colgroup>
            <thead>
              <tr>
                <th>Sale</th>
                <th>
                  <button type="button" class="sort-btn" @click="sortBy('date')">
                    Date <span aria-hidden="true">{{ sortMark('date') }}</span>
                  </button>
                </th>
                <th>Cashier</th>
                <th>Items</th>
                <th class="num">
                  <button type="button" class="sort-btn ml-auto" @click="sortBy('total')">
                    Total <span aria-hidden="true">{{ sortMark('total') }}</span>
                  </button>
                </th>
                <th>Status</th>
                <th class="text-right"><span class="sr-only">Receipt</span></th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="sale in visibleSales"
                :key="sale.id"
              >
                <td class="cell-main">
                  <span class="text-sm font-semibold text-white">#{{ sale.id }}</span>
                </td>

                <td data-label="Date" class="whitespace-nowrap text-sm text-zinc-300" :title="fullDate(sale.created_at)">
                  {{ dayAndTime(sale.created_at) }}
                </td>

                <td data-label="Cashier">
                  <button
                    type="button"
                    class="flex min-w-0 items-center gap-2 text-left"
                    :title="`Only ${cashierName(sale)}'s sales`"
                    @click.stop="setCashier(String(cashierKey(sale)))"
                  >
                    <span class="avatar h-7 w-7 text-[0.62rem]" aria-hidden="true">{{ initialsOf(cashierName(sale)) }}</span>
                    <span class="truncate text-sm font-semibold text-zinc-200 hover:text-white hover:underline">
                      {{ cashierName(sale) }}
                    </span>
                  </button>
                </td>

                <td data-label="Items">
                  <p class="truncate text-sm text-zinc-200" :title="itemNames(sale)">
                    {{ firstItem(sale) }}
                    <span v-if="moreItems(sale)" class="text-zinc-500">+{{ moreItems(sale) }} more</span>
                  </p>
                  <p class="text-xs text-zinc-500">{{ count(piecesOf(sale)) }} pcs</p>
                </td>

                <td data-label="Total" class="num">
                  <p class="font-bold text-white">{{ peso(sale.total_amount) }}</p>
                  <p v-if="Number(sale.refunded_amount) > 0" class="text-xs text-zinc-500 line-through">
                    {{ peso(Number(sale.total_amount) + Number(sale.refunded_amount)) }}
                  </p>
                </td>

                <td data-label="Status">
                  <span class="status-chip" :class="statusOf(sale).tone">
                    <i aria-hidden="true"></i>{{ statusOf(sale).label }}
                  </span>
                </td>

                <td class="cell-actions">
                  <div class="row-actions">
                    <button
                      type="button"
                      class="view-btn"
                      @click.stop="openReceipt(sale)"
                    >
                      <NavIcon name="docs" class="h-3.5 w-3.5" /> Receipt
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="loading && sales.length === 0" class="p-8 text-center text-zinc-500">
          Loading sales…
        </p>
        <p v-else-if="errorMessage" class="p-8 text-center text-red-400">
          Couldn't load the sales: {{ errorMessage }}
        </p>
        <div v-else-if="filteredSales.length === 0" class="p-10 text-center">
          <p class="font-bold text-white">{{ sales.length === 0 ? 'No sales yet' : 'No sales match' }}</p>
          <p class="mt-1 text-sm text-zinc-500">
            {{ sales.length === 0 ? 'Sales from the POS show up here.' : 'Try another period, cashier or search.' }}
          </p>
        </div>

        <TablePager
          v-else
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filteredSales.length"
          noun="sales"
        />
      </div>
    </template>

    <!-- RECEIPT -->
    <div
      v-if="receiptSale"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="receiptSale = null"
    >
      <div
        class="flex max-h-[92vh] w-full max-w-md flex-col rounded-[24px] border border-white/10 bg-zinc-900 p-5"
        role="dialog"
        aria-modal="true"
        :aria-label="`Receipt of sale #${receiptSale.id}`"
      >
        <div class="mb-4 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Receipt</p>
            <h2 class="text-xl font-extrabold text-white">Sale #{{ receiptSale.id }}</h2>
            <p class="text-xs text-zinc-400">{{ fullDate(receiptSale.created_at) }} · {{ cashierName(receiptSale) }}</p>
          </div>
          <span class="status-chip mt-1 shrink-0" :class="statusOf(receiptSale).tone">
            <i aria-hidden="true"></i>{{ statusOf(receiptSale).label }}
          </span>
        </div>

        <div class="min-h-0 overflow-y-auto">
          <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
            <div class="text-center">
              <h2 class="text-2xl font-extrabold">10 FIVE 7 Hardware</h2>
              <p class="text-sm">Inventory Management System</p>
              <p class="mt-2 text-xs">Sales Receipt</p>
            </div>

            <div class="my-4 border-t border-dashed border-black"></div>

            <div class="text-sm">
              <p><strong>Sale No:</strong> #{{ receiptSale.id }}</p>
              <p><strong>Date:</strong> {{ fullDate(receiptSale.created_at) }}</p>
              <p><strong>Cashier:</strong> {{ cashierName(receiptSale) }}</p>
            </div>

            <div class="my-4 border-t border-dashed border-black"></div>

            <div class="space-y-3">
              <div v-for="item in receiptSale.sale_items" :key="item.id" class="text-sm">
                <div class="flex justify-between gap-3">
                  <p class="font-bold">{{ item.product_name }}</p>
                  <p class="shrink-0">{{ peso(item.subtotal) }}</p>
                </div>
                <p class="text-xs">
                  Qty: {{ count(item.quantity) }} × {{ peso(item.price) }}
                  <template v-if="item.refunded_qty > 0"> · {{ count(item.refunded_qty) }} refunded</template>
                </p>
              </div>
            </div>

            <div class="my-4 border-t border-dashed border-black"></div>

            <div v-if="Number(receiptSale.refunded_amount) > 0" class="mb-1 flex justify-between text-sm">
              <span>Refunded</span>
              <span>−{{ peso(receiptSale.refunded_amount) }}</span>
            </div>

            <div class="flex justify-between text-lg font-extrabold">
              <span>Total</span>
              <span>{{ peso(receiptSale.total_amount) }}</span>
            </div>

            <p class="mt-5 text-center text-xs">Thank you for your purchase!</p>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <button class="rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700" @click="receiptSale = null">
            Close
          </button>
          <button class="rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700" @click="printReceipt">
            Print
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'
import { printElement } from '../../lib/printReceipt'
import { usePagination } from '../../lib/usePagination'
import { downloadSalesPdf } from '../../lib/salesPdf'
import { downloadSalesExcel } from '../../lib/salesExcel'
import { newestFirst } from '../../lib/salesReport'
import SalesPeriodFilter from '../../components/SalesPeriodFilter.vue'
import SalesInsights from '../../components/SalesInsights.vue'
import NavIcon from '../../components/NavIcon.vue'
import PageHeader from '../../components/PageHeader.vue'
import TablePager from '../../components/TablePager.vue'
import RefundApprovals from '../../components/RefundApprovals.vue'
import { listAllRefunds } from '../../lib/refunds'
import { useQueryParam } from '../../lib/useQueryParam'
import { count, dayAndTime, peso } from '../../lib/format'

const sales = ref([])
const loading = ref(true) // until the first load is done
const errorMessage = ref('')
const receiptSale = ref(null)

/* ---- cashier: in the address (?cashier=<id>), so a link or a refresh keeps it ---- */
const route = useRoute()
const router = useRouter()

const cashierFilter = computed(() => (typeof route.query.cashier === 'string' ? route.query.cashier : ''))

function setCashier(key) {
  const query = { ...route.query }
  if (key) query.cashier = key
  else delete query.cashier
  router.replace({ query })
}

function cashierName(sale) {
  return sale.profiles?.full_name || sale.cashier_name || 'Unknown cashier'
}

// the cashier's id, so two cashiers with the same name are never mixed up
function cashierKey(sale) {
  return sale.cashier_id || sale.user_id || sale.created_by || sale.profiles?.id || cashierName(sale)
}

// "Maria Dela Cruz" → "MC"
function initialsOf(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean)
  const letters = (words[0]?.[0] || '') + (words.length > 1 ? words[words.length - 1][0] : '')
  return letters.toUpperCase() || '?'
}

// every cashier who has sales, A–Z
const cashierOptions = computed(() => {
  const seen = new Map()
  for (const sale of sales.value) {
    const key = String(cashierKey(sale))
    if (!seen.has(key)) seen.set(key, { key, name: cashierName(sale) })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const selectedCashier = computed(() => {
  if (!cashierFilter.value) return null
  const option = cashierOptions.value.find((o) => o.key === cashierFilter.value)
  const name = option?.name || (loading.value ? 'Loading…' : 'Unknown cashier')
  return { key: cashierFilter.value, name, initials: option ? initialsOf(name) : '?' }
})

/* ---- period and search ---- */
// { start, end } of the date filter (end not included); null = no limit
const range = ref({ start: null, end: null })
const search = ref('')

function inWindow(sale, start, end) {
  const date = new Date(sale.created_at)
  return (!start || date >= start) && (!end || date < end)
}

function ofCashier(sale) {
  return !cashierFilter.value || String(cashierKey(sale)) === cashierFilter.value
}

function matchesSearch(sale) {
  const q = search.value.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  if (String(sale.id) === q || String(sale.id).startsWith(q)) return true
  if (cashierName(sale).toLowerCase().includes(q)) return true
  return (sale.sale_items || []).some((item) => String(item.product_name || '').toLowerCase().includes(q))
}

// sales in the chosen period, of the chosen cashier, matching the search
const filteredSales = computed(() =>
  sales.value.filter((s) => ofCashier(s) && matchesSearch(s) && inWindow(s, range.value.start, range.value.end))
)

/* ---- sorting: date (newest first) or total ---- */
const sortKey = ref('date')
const sortDir = ref('desc')

function sortBy(key) {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'desc' ? 'asc' : 'desc'
  else {
    sortKey.value = key
    sortDir.value = 'desc'
  }
}

function sortMark(key) {
  if (sortKey.value !== key) return '↕'
  return sortDir.value === 'desc' ? '↓' : '↑'
}

const sortedSales = computed(() => {
  const list = [...filteredSales.value]
  const sign = sortDir.value === 'desc' ? -1 : 1
  if (sortKey.value === 'total') {
    list.sort((a, b) => sign * (Number(a.total_amount || 0) - Number(b.total_amount || 0)))
  } else {
    list.sort((a, b) => sign * (new Date(a.created_at) - new Date(b.created_at)))
  }
  return list
})

/* ---- summary ---- */
function piecesOf(sale) {
  return (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
}

function summarize(list) {
  const net = list.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
  const refunded = list.reduce((sum, s) => sum + Number(s.refunded_amount || 0), 0)
  const products = new Set(list.flatMap((s) => (s.sale_items || []).map((i) => i.product_name)))
  return {
    net,
    count: list.length,
    average: list.length ? net / list.length : 0,
    items: list.reduce((n, s) => n + piecesOf(s), 0),
    products: products.size,
    refunded,
    refundedSales: list.filter((s) => Number(s.refunded_amount) > 0).length,
  }
}

const summary = computed(() => summarize(filteredSales.value))

// against the period just before, of the same length ("↑ 12% vs previous 7 days")
const change = computed(() => {
  const { start, end } = range.value
  if (!start) return null
  const stop = end || new Date()
  const length = stop - start
  const previous = sales.value.filter((s) => ofCashier(s) && matchesSearch(s) && inWindow(s, new Date(start - length), start))
  const before = summarize(previous).net
  if (!before) return null
  const pct = Math.round(((summary.value.net - before) / before) * 100)
  const days = Math.max(1, Math.round(length / 86400000))
  return {
    up: pct >= 0,
    text: `${pct >= 0 ? '+' : ''}${pct}% vs previous ${days === 1 ? 'day' : `${days} days`}`,
  }
})

/* ---- a row ---- */
function statusOf(sale) {
  const refunded = Number(sale.refunded_amount || 0)
  if (refunded > 0 && Number(sale.total_amount || 0) <= 0) return { label: 'Refunded', tone: 'is-red' }
  if (refunded > 0) return { label: 'Part refunded', tone: 'is-amber' }
  return { label: 'Paid', tone: 'is-green' }
}

function firstItem(sale) {
  return sale.sale_items?.[0]?.product_name || 'No items'
}

function moreItems(sale) {
  return Math.max(0, (sale.sale_items?.length || 0) - 1)
}

function itemNames(sale) {
  return (sale.sale_items || []).map((i) => `${i.product_name} × ${i.quantity}`).join('\n')
}

function fullDate(date) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/* ---- pages: 10, 15 or all sales (the choice is remembered on this device) ---- */
const tableTop = ref(null)
const {
  page,
  pageSize,
  visible: visibleSales,
  reset: resetPage,
} = usePagination(sortedSales, { storageKey: 'adminSales', scrollTarget: tableTop })

// another period, cashier, search or order starts again at page 1
watch([range, cashierFilter, search, sortKey, sortDir], resetPage)

/* ---- downloads of what's shown (lib/salesPdf.js, lib/salesExcel.js) ---- */
const exporting = ref('') // 'pdf' | 'excel' while a file is being made
const exportError = ref('')

// whose sales are shown, for the file's heading and name ('' = everyone)
function cashiersShown() {
  if (selectedCashier.value) return selectedCashier.value.name
  if (!search.value.trim()) return ''
  const names = [...new Set(filteredSales.value.map(cashierName))]
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

async function exportFile(kind) {
  if (exporting.value || filteredSales.value.length === 0) return

  exporting.value = kind
  exportError.value = ''

  const options = {
    sales: newestFirst(filteredSales.value),
    range: range.value,
    who: cashiersShown(),
    cashierOf: cashierName,
  }

  try {
    if (kind === 'excel') await downloadSalesExcel(options)
    else await downloadSalesPdf(options)
  } catch (err) {
    // e.g. no connection, or the site was updated since this page opened
    console.error(err)
    exportError.value = `Couldn't make the ${kind === 'excel' ? 'Excel file' : 'PDF'}. Reload the page and try again.`
  } finally {
    exporting.value = ''
  }
}

async function fetchSales() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_all_sales')

  loading.value = false

  // a failed load used to look exactly like "No sales records found"
  if (error) {
    errorMessage.value = error.message
    return
  }

  sales.value = newestFirst(data || [])
}

function openReceipt(sale) {
  receiptSale.value = sale
}

function printReceipt() {
  printElement('receiptArea')
}

/* ---- Sales | Refunds ---- */
const VIEW_TABS = [
  { key: 'sales', label: 'Sales' },
  { key: 'refunds', label: 'Refunds' },
]
const view = useQueryParam('view', 'sales', ['sales', 'refunds'])

// the refunds of the last 7 days (lib/refunds.js)
const refunds = ref([])
const refundsReady = ref(true)
// the Refunds tab's tiles: the last 7 days (the list below), and every sale
const refundsWeek = computed(() => {
  const done = refunds.value.filter((request) => request.status === 'approved')
  return { amount: done.reduce((sum, r) => sum + Number(r.amount || 0), 0), count: done.length }
})

const refundsAll = computed(() => {
  const refunded = sales.value.filter((sale) => Number(sale.refunded_amount) > 0)
  return { amount: refunded.reduce((sum, sale) => sum + Number(sale.refunded_amount || 0), 0), sales: refunded.length }
})

// a request left from before refunds needed no approval
const refundsWaiting = computed(() => refunds.value.filter((request) => request.status === 'pending').length)

async function fetchRefunds() {
  try {
    const { ready, list } = await listAllRefunds()
    refundsReady.value = ready
    refunds.value = list
  } catch (err) {
    console.error(err)
  }
}

// a refund lowers a sale: the list and totals follow
watch(view, (next) => {
  if (next === 'refunds') fetchRefunds()
  else fetchSales()
})

onMounted(() => {
  fetchSales()
  fetchRefunds()
})
</script>

<style scoped src="../../styles/dashboard.css"></style>

<style scoped>
/* the PDF / Excel buttons above the table */
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.75rem;
  border: 1px solid var(--hairline);
  background: var(--surface-sunken);
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #fff;
  transition: background-color 0.15s, border-color 0.15s;
}

.export-btn:hover:not(:disabled) {
  border-color: rgba(224, 27, 50, 0.45);
  background: rgba(224, 27, 50, 0.12);
}

.export-btn:disabled {
  opacity: 0.5;
}

/* search and cashier, next to the period buttons */
.filter-box {
  border-radius: 999px;
  border: 1px solid var(--hairline);
  background: var(--color-zinc-900);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  color: #fff;
  outline: none;
}

/* a cashier is picked: the box says so */
.filter-box.is-picked {
  border-color: var(--brand);
  background: rgba(224, 27, 50, 0.15);
  font-weight: 700;
}

.filter-box:focus {
  border-color: rgba(224, 27, 50, 0.55);
}

.filter-box::placeholder {
  color: var(--color-zinc-500);
}

/* initials in a red circle */
.avatar {
  display: grid;
  flex: none;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 22%, transparent);
  font-weight: 800;
  color: #fecaca;
}

/* Receipt button of a row */
.view-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
  border-radius: 0.6rem;
  background: var(--color-zinc-800);
  padding: 0.4rem 0.7rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.view-btn:hover {
  background: var(--color-zinc-700);
  color: #fff;
}

/* Date / Total headers: click to sort */
.sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  color: inherit;
}

.sort-btn:hover {
  color: #fff;
}

.sort-btn span {
  font-size: 0.8rem;
  letter-spacing: 0;
}

/* Paid / Part refunded / Refunded */
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 700;
}

.status-chip i {
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 999px;
  background: currentColor;
}

.status-chip.is-green {
  background: rgba(16, 185, 129, 0.14);
  color: #6ee7b7;
}

.status-chip.is-amber {
  background: rgba(245, 158, 11, 0.14);
  color: #fcd34d;
}

.status-chip.is-red {
  background: rgba(239, 68, 68, 0.14);
  color: #fca5a5;
}
</style>
