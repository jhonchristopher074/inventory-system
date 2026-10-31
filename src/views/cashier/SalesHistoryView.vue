<template>
  <div>
    <PageHeader
      title="Sales History"
      subtitle="Company-style record of completed cashier transactions."
    />

    <!-- DATE FILTER (shared with the other Sales History page) -->
    <SalesPeriodFilter v-model="range" />

    <!-- SUMMARY of what's shown -->
    <div class="mb-6 grid gap-4 sm:grid-cols-3">
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Total sales</p>
        <p class="mt-1 text-2xl font-extrabold text-red-400">{{ peso(summaryTotal) }}</p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Transactions</p>
        <p class="mt-1 text-2xl font-extrabold text-white">{{ count(filteredSales.length) }}</p>
      </div>

      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <p class="text-sm text-zinc-400">Items sold</p>
        <p class="mt-1 text-2xl font-extrabold text-white">{{ count(summaryItems) }}</p>
      </div>
    </div>

    <!-- CHART + BEST SELLERS of your sales shown (opens with its button) -->
    <SalesInsights :sales="filteredSales" :range="range" />

    <!-- TABLE: 10, 15 or all sales a page. No report download here: sales
         reports (PDF, Excel) are made by the owner, in their Sales History. -->
    <div ref="tableTop" class="scroll-mt-4 overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900">
      <!-- resp-table: each sale becomes a small card on phones -->
      <table class="resp-table w-full border-collapse text-left">
        <thead class="bg-black text-sm text-zinc-400">
          <tr>
            <th class="px-5 py-4">Sale ID</th>
            <th class="px-5 py-4">Date</th>
            <th class="px-5 py-4">Items</th>
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
            <td data-label="Sale ID" class="px-5 py-4 font-bold text-white">
              #{{ sale.id }}
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

      <p v-if="loading && sales.length === 0" class="p-6 text-center text-zinc-500">
        Loading sales...
      </p>
      <p v-else-if="errorMessage" class="p-6 text-center text-red-400">
        Couldn't load your sales: {{ errorMessage }}
      </p>
      <p v-else-if="filteredSales.length === 0" class="p-6 text-center text-zinc-500">
        {{ sales.length === 0 ? 'No sales found.' : 'No sales in this period.' }}
      </p>

      <TablePager
        v-else
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="filteredSales.length"
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
      </div>
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
            <h2 class="text-2xl font-extrabold">10 FIVE 7 Hardware</h2>
            <p class="text-sm">Inventory Management System</p>
            <p class="mt-2 text-xs">Official Sales Receipt</p>
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
import { supabase } from '../../lib/supabase'
import { printElement } from '../../lib/printReceipt'
import { usePagination } from '../../lib/usePagination'
import { newestFirst } from '../../lib/salesReport'
import SalesPeriodFilter from '../../components/SalesPeriodFilter.vue'
import SalesInsights from '../../components/SalesInsights.vue'
import TablePager from '../../components/TablePager.vue'
import PageHeader from '../../components/PageHeader.vue'
import { count, peso } from '../../lib/format'

const sales = ref([])
const loading = ref(false)
const errorMessage = ref('')
const selectedSale = ref(null)
const receiptSale = ref(null)

// { start, end } of the date filter (end not included); null = no limit
const range = ref({ start: null, end: null })

function inRange(sale) {
  const date = new Date(sale.created_at)
  const { start, end } = range.value
  return (!start || date >= start) && (!end || date < end)
}

const filteredSales = computed(() => sales.value.filter(inRange))

const summaryTotal = computed(() =>
  filteredSales.value.reduce((sum, s) => sum + Number(s.total_amount || 0), 0)
)

const summaryItems = computed(() =>
  filteredSales.value.reduce(
    (sum, s) => sum + (s.sale_items || []).reduce((n, i) => n + Number(i.quantity || 0), 0),
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
} = usePagination(filteredSales, { storageKey: 'mySales', scrollTarget: tableTop })

// another period starts again at page 1
watch(range, resetPage)

async function fetchSales() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_my_sales')

  loading.value = false

  // a failed load used to look exactly like "No sales found"
  if (error) {
    errorMessage.value = error.message
    return
  }

  // the latest sale first, the same order as the owner's reports
  sales.value = newestFirst(data || [])
}

function openSale(sale) {
  selectedSale.value = sale
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