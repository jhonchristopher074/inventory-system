<template>
  <div>
    <!-- HEADER -->
    <div class="mb-6 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <!-- one cashier's sales (their name was clicked) -->
      <template v-if="selectedCashier">
        <button
          type="button"
          class="inline-flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-600/15 px-4 py-2.5 text-sm font-bold text-red-100 transition hover:border-red-600 hover:bg-red-600 hover:text-white"
          @click="showAllSales"
        >
          <NavIcon name="back" class="h-4 w-4" />
          Back to all sales
        </button>

        <div class="mt-4 flex items-center gap-4">
          <span
            class="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-red-600 text-2xl font-extrabold text-white"
            aria-hidden="true"
          >
            {{ selectedCashier.initials }}
          </span>

          <div class="min-w-0">
            <p class="text-xs font-bold uppercase tracking-[0.16em] text-red-400">
              Cashier sales history
            </p>
            <h1 class="break-words text-3xl font-bold text-white">
              {{ selectedCashier.name }}
            </h1>
            <p class="text-zinc-400">Only this cashier's sales are shown below.</p>
          </div>
        </div>
      </template>

      <template v-else>
        <h1 class="text-3xl font-bold text-white">Admin Sales History</h1>
        <p class="text-zinc-400">
          Monitor all cashier transactions and receipts. Click a cashier name to see their sales.
        </p>
      </template>
    </div>

    <!-- DATE FILTER, with the cashier search at the right end of its row
         (not needed once a cashier's name was clicked) -->
    <SalesPeriodFilter v-model="range">
      <template v-if="!selectedCashier" #end>
        <input
          v-model="cashierSearch"
          type="search"
          placeholder="Search cashier..."
          aria-label="Search cashier"
          list="cashier-names"
          class="w-full rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
        />
        <!-- suggestions while typing: every cashier who has sales -->
        <datalist id="cashier-names">
          <option v-for="name in cashierNames" :key="name" :value="name" />
        </datalist>
      </template>
    </SalesPeriodFilter>

    <!-- SUMMARY of what's shown (date filter + cashier) -->
    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Total sales</p>
        <p class="mt-1 text-2xl font-extrabold text-red-400">
          {{ peso(summaryTotal) }}
        </p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Transactions</p>
        <p class="mt-1 text-2xl font-extrabold text-white">
          {{ count(filteredSales.length) }}
        </p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Items sold</p>
        <p class="mt-1 text-2xl font-extrabold text-white">
          {{ count(summaryItems) }}
        </p>
      </div>
    </div>

    <!-- CHART + BEST SELLERS of what's shown -->
    <SalesInsights :sales="filteredSales" :range="range" />

    <!-- what the list shows, and download it: a PDF to read or print, CSV for Excel -->
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <!-- one cashier: whose sales these are (the header is scrolled out of
           view by now; its "Back to all sales" button goes back) -->
      <div v-if="selectedCashier" class="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
        <span>{{ salesCountText }} of</span>
        <span class="inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-600/10 py-1 pl-1 pr-3">
          <span
            class="grid h-6 w-6 place-items-center rounded-full bg-red-600 text-[0.65rem] font-extrabold text-white"
            aria-hidden="true"
          >
            {{ selectedCashier.initials }}
          </span>
          <b class="text-white">{{ selectedCashier.name }}</b>
        </span>
      </div>

      <p v-else class="text-sm text-zinc-400">{{ salesCountText }}</p>

      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
          :disabled="filteredSales.length === 0 || pdfBusy"
          title="A table of the sales shown, easy to read and print"
          @click="exportPdf"
        >
          {{ pdfBusy ? 'Making PDF…' : '⬇ PDF' }}
        </button>
        <button
          class="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          :disabled="filteredSales.length === 0"
          title="One row per sale"
          @click="exportCsv('sales')"
        >
          ⬇ Sales CSV
        </button>
        <button
          class="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-zinc-800 disabled:opacity-50"
          :disabled="filteredSales.length === 0"
          title="One row per product sold"
          @click="exportCsv('items')"
        >
          ⬇ Items CSV
        </button>
      </div>
    </div>

    <p v-if="pdfError" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
      {{ pdfError }}
    </p>

    <!-- TABLE: 10, 15 or all sales a page -->
    <div ref="tableTop" class="scroll-mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900">
      <table class="resp-table w-full border-collapse text-left">
        <thead class="bg-black text-sm text-zinc-400">
          <tr>
            <th class="px-5 py-4">Sale ID</th>
            <!-- one cashier: their name is already above the table -->
            <th v-if="!selectedCashier" class="px-5 py-4">Cashier</th>
            <th class="px-5 py-4">Date</th>
            <th class="px-5 py-4">Items</th>
            <th class="px-5 py-4">Total</th>
            <th class="px-5 py-4">Receipt</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="sale in visibleSales"
            :key="sale.id"
            class="border-t border-white/10 transition hover:border-l-4 hover:border-l-blue-500 hover:bg-zinc-800/70"
          >
            <td data-label="Sale ID" class="px-5 py-4 font-bold text-white">
              #{{ sale.id }}
            </td>

            <td v-if="!selectedCashier" data-label="Cashier" class="px-5 py-4">
              <button
                class="font-semibold text-zinc-200 hover:text-red-400 hover:underline"
                @click="openCashier(sale)"
              >
                {{ cashierName(sale) }}
              </button>
            </td>

            <td data-label="Date" class="px-5 py-4 text-zinc-300">
              {{ formatDate(sale.created_at) }}
            </td>

            <td data-label="Items" class="px-5 py-4 text-zinc-300">
              {{ sale.sale_items?.length || 0 }} item(s)
            </td>

            <td data-label="Total" class="px-5 py-4 font-bold text-red-400">
              {{ peso(sale.total_amount) }}
            </td>

            <td data-label="Receipt" class="px-5 py-4">
              <span
                class="cursor-pointer font-bold text-blue-400 hover:underline"
                @click="openReceipt(sale)"
              >
                Receipt
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="loading && sales.length === 0" class="p-6 text-center text-zinc-500">
        Loading sales...
      </p>
      <p v-else-if="errorMessage" class="p-6 text-center text-red-400">
        Couldn't load the sales: {{ errorMessage }}
      </p>
      <p v-else-if="filteredSales.length === 0" class="p-6 text-center text-zinc-500">
        {{ sales.length === 0 ? 'No sales records found.' : 'No sales in this period.' }}
      </p>

      <TablePager
        v-else
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredSales.length"
        noun="sales"
      />
    </div>

    <!-- RECEIPT MODAL -->
    <div
      v-if="receiptSale"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="receiptSale = null"
    >
      <div class="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
          <div class="text-center">
            <h2 class="text-2xl font-extrabold">
              10 FIVE 7 Hardware
            </h2>

            <p class="text-sm">
              Inventory Management System
            </p>

            <p class="mt-2 text-xs">
              Official Sales Receipt
            </p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="text-sm">
            <p>
              <strong>Sale No:</strong>
              #{{ receiptSale.id }}
            </p>

            <p>
              <strong>Date:</strong>
              {{ formatDate(receiptSale.created_at) }}
            </p>

            <p>
              <strong>Cashier:</strong>
              {{ receiptSale.profiles?.full_name }}
            </p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="space-y-3">
            <div
              v-for="item in receiptSale.sale_items"
              :key="item.id"
              class="text-sm"
            >
              <div class="flex justify-between">
                <p class="font-bold">
                  {{ item.product_name }}
                </p>

                <p>
                  {{ peso(item.subtotal) }}
                </p>
              </div>

              <p class="text-xs">
                Qty: {{ count(item.quantity) }}
                ×
                {{ peso(item.price) }}
              </p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>

            <span>
              {{ peso(receiptSale.total_amount) }}
            </span>
          </div>

          <p class="mt-5 text-center text-xs">
            Thank you for your purchase!
          </p>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3">
          <button
            class="rounded-xl bg-zinc-800 py-3 font-bold text-white hover:bg-zinc-700"
            @click="receiptSale = null"
          >
            Close
          </button>

          <button
            class="rounded-xl bg-red-600 py-3 font-bold text-white hover:bg-red-700"
            @click="printReceipt"
          >
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
import SalesPeriodFilter from '../../components/SalesPeriodFilter.vue'
import SalesInsights from '../../components/SalesInsights.vue'
import NavIcon from '../../components/NavIcon.vue'
import TablePager from '../../components/TablePager.vue'
import { count, peso } from '../../lib/format'

const sales = ref([])
const loading = ref(true) // until the first load is done
const errorMessage = ref('')
const receiptSale = ref(null)

// The clicked cashier lives in the address (?cashier=<id>), so the browser's
// Back button returns to all sales instead of leaving the page.
const route = useRoute()
const router = useRouter()

const selectedCashier = computed(() => {
  const key = route.query.cashier
  if (!key) return null // show everyone
  const sale = sales.value.find((s) => String(cashierKey(s)) === key)
  if (sale) return { key, name: cashierName(sale), initials: initialsOf(cashierName(sale)) }

  // still loading, or an old link to a cashier with no sales left
  return { key, name: loading.value ? 'Loading…' : 'Unknown cashier', initials: '?' }
})

// "Maria Dela Cruz" → "MC"
function initialsOf(name) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters = (words[0]?.[0] || '') + (words.length > 1 ? words[words.length - 1][0] : '')
  return letters.toUpperCase() || '?'
}

function openCashier(sale) {
  router.push({ query: { ...route.query, cashier: String(cashierKey(sale)) } })
}

function showAllSales() {
  // came here by clicking a name: go back, so Back/Forward stay in order
  const back = window.history.state?.back
  if (back && router.resolve(back).path === route.path && !router.resolve(back).query.cashier) {
    router.back()
  } else {
    const query = { ...route.query }
    delete query.cashier
    router.replace({ query })
  }
}

// { start, end } of the date filter (end not included); null = no limit
const range = ref({ start: null, end: null })

// part of a cashier's name typed in the search box
const cashierSearch = ref('')

const cashierNames = computed(() =>
  [...new Set(sales.value.map(cashierName))].sort((a, b) => a.localeCompare(b))
)

function inRange(sale) {
  const date = new Date(sale.created_at)
  const { start, end } = range.value
  return (!start || date >= start) && (!end || date < end)
}

function cashierName(sale) {
  return sale.profiles?.full_name || 'Unknown Cashier'
}

// Prefer the cashier's id so two cashiers with the same name are never mixed up.
function cashierKey(sale) {
  return (
    sale.cashier_id ||
    sale.user_id ||
    sale.created_by ||
    sale.profiles?.id ||
    cashierName(sale)
  )
}

// sales in the chosen period, of the chosen cashier (if any)
const filteredSales = computed(() => {
  const search = cashierSearch.value.trim().toLowerCase()

  return sales.value.filter(
    (s) =>
      (!selectedCashier.value || String(cashierKey(s)) === selectedCashier.value.key) &&
      (selectedCashier.value || !search || cashierName(s).toLowerCase().includes(search)) &&
      inRange(s)
  )
})

const salesCountText = computed(
  () => `${count(filteredSales.value.length)} sale${filteredSales.value.length === 1 ? '' : 's'}`
)

const summaryTotal = computed(() =>
  filteredSales.value.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
)

const summaryItems = computed(() =>
  filteredSales.value.reduce(
    (sum, s) =>
      sum + (s.sale_items || []).reduce((n, i) => n + Number(i.quantity || 0), 0),
    0
  )
)

// 10, 15 or all sales a page, with page buttons under the table. The choice
// is remembered on this device.
const tableTop = ref(null)
const {
  page,
  pageSize,
  visible: visibleSales,
  reset: resetPage,
} = usePagination(filteredSales, { storageKey: 'adminSales', scrollTarget: tableTop })

// another period, cashier or search starts again at page 1
watch([range, () => route.query.cashier, cashierSearch], resetPage)

// Downloads the sales shown (date filter + cashier) as a CSV file for Excel.
//   'sales': one row per sale, its products in one column
//   'items': one row per product sold (best for totals per product in Excel)
function exportCsv(kind) {
  const cell = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
  }

  const when = (sale) => {
    const date = new Date(sale.created_at)
    return [
      date.toLocaleDateString('en-CA'), // 2026-10-19: Excel sorts it right
      date.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
    ]
  }

  let rows

  if (kind === 'items') {
    rows = [['Sale ID', 'Date', 'Time', 'Cashier', 'Product', 'Quantity', 'Price (PHP)', 'Subtotal (PHP)']]

    for (const sale of filteredSales.value) {
      for (const item of sale.sale_items || []) {
        const quantity = Number(item.quantity || 0)
        const price = Number(item.price || 0)
        rows.push([
          sale.id,
          ...when(sale),
          cashierName(sale),
          item.product_name,
          quantity,
          price.toFixed(2),
          Number(item.subtotal ?? price * quantity).toFixed(2),
        ])
      }
    }

    rows.push(['', '', '', '', 'TOTAL', summaryItems.value, '', summaryTotal.value.toFixed(2)])
  } else {
    rows = [['Sale ID', 'Date', 'Time', 'Cashier', 'Products', 'Items sold', 'Total (PHP)']]

    for (const sale of filteredSales.value) {
      const items = sale.sale_items || []
      rows.push([
        sale.id,
        ...when(sale),
        cashierName(sale),
        items.map((i) => `${i.product_name} x${i.quantity}`).join('; '),
        items.reduce((n, i) => n + Number(i.quantity || 0), 0),
        Number(sale.total_amount || 0).toFixed(2),
      ])
    }

    rows.push(['', '', '', '', 'TOTAL', summaryItems.value, summaryTotal.value.toFixed(2)])
  }

  // the BOM makes Excel read names with ñ and the like correctly
  const csv = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))

  const { start, end } = range.value
  const day = (d) => d.toLocaleDateString('en-CA')
  const period = start
    ? `${day(start)}_to_${day(end ? new Date(end.getTime() - 86400000) : new Date())}`
    : 'all'
  const who = selectedCashier.value?.name || cashierSearch.value.trim()

  const link = document.createElement('a')
  link.href = url
  link.download = `${kind === 'items' ? 'items-sold' : 'sales'}_${period}${who ? '_' + who.replace(/[^A-Za-z0-9]+/g, '-') : ''}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

// Downloads the sales shown (date filter + cashier) as a PDF with a table,
// easy to read and print (see lib/salesPdf.js).
const pdfBusy = ref(false)
const pdfError = ref('')

// whose sales are shown, for the PDF's heading and file name ('' = everyone)
function cashiersShown() {
  if (selectedCashier.value) return selectedCashier.value.name
  if (!cashierSearch.value.trim()) return ''

  const names = [...new Set(filteredSales.value.map(cashierName))]
  return names.length <= 3
    ? names.join(', ')
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

async function exportPdf() {
  if (pdfBusy.value || filteredSales.value.length === 0) return

  pdfBusy.value = true
  pdfError.value = ''

  try {
    await downloadSalesPdf({
      sales: filteredSales.value,
      range: range.value,
      who: cashiersShown(),
      cashierOf: cashierName,
    })
  } catch (err) {
    // e.g. no connection, or the site was updated since this page opened
    console.error(err)
    pdfError.value = "Couldn't make the PDF. Reload the page and try again."
  } finally {
    pdfBusy.value = false
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

  sales.value = data || []
}

function openReceipt(sale) {
  receiptSale.value = sale
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

function printReceipt() {
  printElement('receiptArea')
}

onMounted(fetchSales)
</script>