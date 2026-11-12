<template>
  <div>
    <PageHeader
      title="Sales History"
    />

    <!-- DATE FILTER (shared with the other Sales History page) -->
    <SalesPeriodFilter v-model="range" />

    <!-- SUMMARY of what's shown -->
    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Total sales</p>
        <p class="mt-1 text-2xl font-extrabold text-red-400">{{ peso(summary.net) }}</p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Transactions</p>
        <p class="mt-1 text-2xl font-extrabold text-white">{{ count(total) }}</p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Items sold</p>
        <p class="mt-1 text-2xl font-extrabold text-white">{{ count(summary.items) }}</p>
      </div>
    </div>

    <!-- CHART + BEST SELLERS of your sales shown (opens with its button) -->
    <SalesInsights :days="summary.days" :top="summary.top" :first-sale="summary.firstSale" :range="range" />

    <!-- TABLE: 10, 15 or all sales a page. No report download here: sales
         reports (PDF, Excel) are made by the owner, in their Sales History. -->
    <div ref="tableTop" class="scroll-mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900">
      <!-- resp-table: each sale becomes a small card on phones -->
      <table class="resp-table w-full border-collapse text-left">
        <thead class="bg-black text-sm text-zinc-400">
          <tr>
            <th class="px-5 py-4">Items</th>
            <th class="px-5 py-4">Date</th>
            <th class="px-5 py-4">Total</th>
            <th class="px-5 py-4">Action</th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="sale in visibleSales"
            :key="sale.id"
            class="cursor-pointer border-t border-white/10 transition hover:border-l-4 hover:border-l-blue-500 hover:bg-zinc-800/70"
            @click="openSale(sale)"
          >
            <td data-label="Items" class="px-5 py-4">
              <p class="text-zinc-200" :title="itemNames(sale)">
                {{ sale.sale_items?.[0]?.product_name || 'No items' }}
                <span v-if="moreItems(sale)" class="text-zinc-500">+{{ moreItems(sale) }} more</span>
              </p>
              <p class="text-xs text-zinc-500">{{ count(piecesOf(sale)) }} pcs</p>
            </td>

            <td data-label="Date" class="px-5 py-4 text-zinc-300">
              {{ formatDate(sale.created_at) }}
            </td>

            <td data-label="Total" class="px-5 py-4 font-bold text-red-400">
              {{ peso(sale.total_amount) }}
            </td>

            <td data-label="Action" class="px-5 py-4">
              <span
                class="font-bold text-blue-400 hover:underline"
                @click.stop="openReceipt(sale)"
              >
                Receipt
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="loading && visibleSales.length === 0" class="p-6 text-center text-zinc-500">
        Loading sales...
      </p>
      <p v-else-if="errorMessage" class="p-6 text-center text-red-400">
        Couldn't load your sales: {{ errorMessage }}
      </p>
      <p v-else-if="total === 0" class="p-6 text-center text-zinc-500">
        {{ range.start ? 'No sales in this period.' : 'No sales found.' }}
      </p>

      <TablePager
        v-else
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="total"
        noun="sales"
      />
    </div>

    <!-- SALE DETAILS MODAL -->
    <div
      v-if="selectedSale"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="selectedSale = null"
    >
      <div class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-white">
              Sale #{{ selectedSale.id }}
            </h2>
            <p class="text-sm text-zinc-400">
              {{ formatDate(selectedSale.created_at) }}
            </p>
          </div>

          <button
            class="rounded-xl bg-red-600 px-4 py-2 font-bold text-white"
            @click="selectedSale = null"
          >
            Close
          </button>
        </div>

        <div class="space-y-3">
          <div
            v-for="item in selectedSale.sale_items"
            :key="item.id"
            class="rounded-2xl bg-black p-4"
          >
            <div class="flex justify-between">
              <div>
                <h3 class="font-bold text-white">{{ item.product_name }}</h3>
                <p class="text-sm text-zinc-400">
                  Qty: {{ count(item.quantity) }} × {{ peso(item.price) }}
                  <span v-if="item.refunded_qty > 0" class="font-bold text-amber-300"> · {{ count(item.refunded_qty) }} refunded</span>
                </p>
              </div>

              <p class="font-bold text-white">
                {{ peso(item.subtotal) }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-between border-t border-white/10 pt-4 text-xl font-bold">
          <span>Total</span>
          <span class="text-red-400">
            {{ peso(selectedSale.total_amount) }}
          </span>
        </div>
        <p v-if="Number(selectedSale.refunded_amount) > 0" class="mt-1 text-right text-sm font-bold text-amber-300">
          {{ peso(selectedSale.refunded_amount) }} refunded
        </p>

        <!-- a customer brought something back: refund it -->
        <button
          v-if="isToday(selectedSale) && (selectedSale.sale_items || []).some((item) => Number(item.quantity) > 0)"
          type="button"
          class="mt-4 w-full rounded-2xl border border-amber-500/40 py-3 font-bold text-amber-300 hover:bg-amber-500/10 hover:text-white"
          @click="refundSale = selectedSale"
        >
          Refund
        </button>
        <p v-else class="mt-4 text-center text-xs text-zinc-500">
          {{ isToday(selectedSale) ? 'Everything in this sale was refunded.' : "Only today's sales can be refunded." }}
        </p>
      </div>
    </div>

    <RefundRequestModal v-if="refundSale" :sale="refundSale" @close="refundSale = null" @sent="refundSent" />
    <p v-if="refundMessage" class="fixed bottom-4 left-1/2 z-[2100] w-[min(92vw,32rem)] -translate-x-1/2 rounded-xl bg-emerald-600 p-3 text-sm font-bold text-white shadow-2xl" role="status">
      {{ refundMessage }}
    </p>

    <!-- RECEIPT MODAL -->
    <div
      v-if="receiptSale"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="receiptSale = null"
    >
      <div class="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
          <div class="text-center">
            <h2 class="text-2xl font-extrabold">10 FIVE 7 Hardware</h2>
            <p class="text-sm">Inventory Management System</p>
            <p class="mt-2 text-xs">Sales Receipt</p>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <p class="text-sm"><strong>Sale No:</strong> #{{ receiptSale.id }}</p>
          <p class="text-sm"><strong>Date:</strong> {{ formatDate(receiptSale.created_at) }}</p>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="space-y-3">
            <div
              v-for="item in receiptSale.sale_items"
              :key="item.id"
              class="text-sm"
            >
              <div class="flex justify-between">
                <p class="font-bold">{{ item.product_name }}</p>
                <p>{{ peso(item.subtotal) }}</p>
              </div>
              <p class="text-xs">
                Qty: {{ count(item.quantity) }} × {{ peso(item.price) }}
              </p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>{{ peso(receiptSale.total_amount) }}</span>
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
import { printElement } from '../../lib/printReceipt'
import { useServerPagination } from '../../lib/usePagination'
import { salesPage, salesSummary } from '../../lib/salesQuery'
import SalesPeriodFilter from '../../components/SalesPeriodFilter.vue'
import SalesInsights from '../../components/SalesInsights.vue'
import TablePager from '../../components/TablePager.vue'
import PageHeader from '../../components/PageHeader.vue'
import { count, peso } from '../../lib/format'
import RefundRequestModal from '../../components/RefundRequestModal.vue'
import { isToday } from '../../lib/refunds'

// this page of your sales, and the totals of all of them in the period,
// worked out by the database (lib/salesQuery.js): never every sale at once
const visibleSales = ref([])
const total = ref(0)
const summary = ref({ net: 0, count: 0, items: 0, days: [], top: [], firstSale: null })
const loading = ref(false)
const errorMessage = ref('')
const selectedSale = ref(null)
const receiptSale = ref(null)

// { start, end } of the date filter (end not included); null = no limit
const range = ref({ start: null, end: null })
const filters = computed(() => ({ from: range.value.start, to: range.value.end, mine: true }))

// 10, 15 or all sales a page, with page buttons under the table. The choice
// is remembered on this device.
const tableTop = ref(null)
const { page, pageSize, limit, offset, reset: resetPage } = useServerPagination({
  storageKey: 'mySales',
  scrollTarget: tableTop,
})

// an answer that comes after a newer question is dropped
let rowsAsked = 0

async function loadRows() {
  const asked = ++rowsAsked
  try {
    const result = await salesPage(filters.value, { limit: limit.value, offset: offset.value })
    if (asked !== rowsAsked) return
    visibleSales.value = result.rows
    total.value = result.total
    errorMessage.value = ''
  } catch (err) {
    // a failed load used to look exactly like "No sales found"
    if (asked === rowsAsked) errorMessage.value = err.message
  }
}

async function loadTotals() {
  try {
    summary.value = await salesSummary(filters.value)
  } catch (err) {
    errorMessage.value = err.message
  }
}

async function fetchSales() {
  loading.value = true
  await Promise.all([loadRows(), loadTotals()])
  loading.value = false
}

// another period: page 1 and its totals; another page: only the rows
watch(range, () => {
  if (page.value !== 1) resetPage()
  else loadRows()
  loadTotals()
})
watch([page, pageSize], loadRows)

function openSale(sale) {
  selectedSale.value = sale
}

function openReceipt(sale) {
  receiptSale.value = sale
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

// the Items cell: the first product, "+N more", and the pieces in all
function moreItems(sale) {
  return Math.max(0, (sale.sale_items?.length || 0) - 1)
}

function piecesOf(sale) {
  return (sale.sale_items || []).reduce((n, item) => n + Number(item.quantity || 0), 0)
}

function itemNames(sale) {
  return (sale.sale_items || []).map((i) => `${i.product_name} × ${i.quantity}`).join('\n')
}

function printReceipt() {
  printElement('receiptArea')
}

// Refund (components/RefundRequestModal.vue)
const refundSale = ref(null)
const refundMessage = ref('')
let refundMessageTimer = null

function refundSent(text) {
  refundSale.value = null
  selectedSale.value = null
  refundMessage.value = text
  // the sale and the totals are lower now
  fetchSales()
  clearTimeout(refundMessageTimer)
  refundMessageTimer = setTimeout(() => (refundMessage.value = ''), 6000)
}

onMounted(fetchSales)
</script>