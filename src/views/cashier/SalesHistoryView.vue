<template>
  <div>
    <div class="mb-6 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <h1 class="text-3xl font-bold text-white">Sales History</h1>
      <p class="text-zinc-400">
        Company-style record of completed cashier transactions.
      </p>
    </div>

    <div class="overflow-hidden rounded-[24px] border border-white/10 bg-zinc-900">
      <table class="w-full border-collapse text-left">
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
            v-for="sale in sales"
            :key="sale.id"
            class="cursor-pointer border-t border-white/10 transition hover:border-l-4 hover:border-l-blue-500 hover:bg-zinc-800/70"
            @click="openSale(sale)"
          >
            <td class="px-5 py-4 font-bold text-white">
              #{{ sale.id }}
            </td>

            <td class="px-5 py-4 text-zinc-300">
              {{ formatDate(sale.created_at) }}
            </td>

            <td class="px-5 py-4 text-zinc-300">
              {{ sale.sale_items?.length || 0 }} item(s)
            </td>

            <td class="px-5 py-4 font-bold text-red-400">
              ₱{{ Number(sale.total_amount).toFixed(2) }}
            </td>

            <td class="px-5 py-4">
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

      <p v-if="sales.length === 0" class="p-6 text-center text-zinc-500">
        No sales found.
      </p>
    </div>

    <!-- SALE DETAILS MODAL -->
    <div
      v-if="selectedSale"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="selectedSale = null"
    >
      <div class="w-full max-w-2xl rounded-[24px] border border-white/10 bg-zinc-900 p-5">
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
                  Qty: {{ item.quantity }} × ₱{{ Number(item.price).toFixed(2) }}
                </p>
              </div>

              <p class="font-bold text-white">
                ₱{{ Number(item.subtotal).toFixed(2) }}
              </p>
            </div>
          </div>
        </div>

        <div class="mt-5 flex justify-between border-t border-white/10 pt-4 text-xl font-bold">
          <span>Total</span>
          <span class="text-red-400">
            ₱{{ Number(selectedSale.total_amount).toFixed(2) }}
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
      <div class="w-full max-w-md rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div id="receiptArea" class="rounded-2xl bg-white p-5 text-black">
          <div class="text-center">
            <h2 class="text-2xl font-extrabold">Hardware</h2>
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
                <p>₱{{ Number(item.subtotal).toFixed(2) }}</p>
              </div>
              <p class="text-xs">
                Qty: {{ item.quantity }} × ₱{{ Number(item.price).toFixed(2) }}
              </p>
            </div>
          </div>

          <div class="my-4 border-t border-dashed border-black"></div>

          <div class="flex justify-between text-lg font-extrabold">
            <span>Total</span>
            <span>₱{{ Number(receiptSale.total_amount).toFixed(2) }}</span>
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
import { onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const sales = ref([])
const selectedSale = ref(null)
const receiptSale = ref(null)

async function fetchSales() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const userId = session?.user?.id

  if (!userId) return

  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items (*)
    `)
    .eq('cashier_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  sales.value = data || []
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
  const receiptContent = document.getElementById('receiptArea').innerHTML
  const printWindow = window.open('', '', 'width=400,height=600')

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
          }

          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .font-extrabold { font-weight: 800; }
          .text-2xl { font-size: 24px; }
          .text-lg { font-size: 18px; }
          .text-sm { font-size: 14px; }
          .text-xs { font-size: 12px; }
          .flex { display: flex; }
          .justify-between { justify-content: space-between; }
          .my-4 { margin-top: 16px; margin-bottom: 16px; }
          .mt-2 { margin-top: 8px; }
          .mt-5 { margin-top: 20px; }
          .space-y-3 > * + * { margin-top: 12px; }
          .border-t { border-top: 1px dashed #000; }
        </style>
      </head>
      <body>${receiptContent}</body>
    </html>
  `)

  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  printWindow.close()
}

onMounted(fetchSales)
</script>