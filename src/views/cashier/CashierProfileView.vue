<template>
  <div>
    <PageHeader title="Cashier Profile" subtitle="Your account details, password and sales." />

    <!-- TABS -->
    <div class="mb-5 flex gap-3 card p-2">
      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'profile'
          ? 'bg-red-600 text-white'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="activeTab = 'profile'"
      >
        Profile Settings
      </button>

      <button
        class="rounded-2xl px-5 py-3 font-bold transition"
        :class="activeTab === 'sales'
          ? 'bg-red-600 text-white'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="openSalesTab"
      >
        Sales History
      </button>
    </div>

    <!-- PROFILE SETTINGS: same profile as staff (photo, read-only details, password) -->
    <MyProfile v-if="activeTab === 'profile'" role-label="CASHIER ACCOUNT" />

    <!-- SALES HISTORY -->
    <div
      v-if="activeTab === 'sales'"
      class="card p-5"
    >
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-white">Daily Sales History</h2>
          <p class="text-sm text-zinc-400">
            Your total sales per day for the last 30 days.
          </p>
        </div>

        <button
          class="rounded-xl bg-red-600 px-5 py-3 font-bold text-white hover:bg-red-700"
          @click="fetchSales"
        >
          Refresh
        </button>
      </div>

      <p v-if="loading" class="py-4 text-zinc-400">Loading sales...</p>

      <p v-if="salesError" class="mb-4 rounded-xl bg-red-600/20 p-3 text-red-400">
        {{ salesError }}
      </p>

      <div class="overflow-hidden rounded-2xl bg-black">
        <table class="w-full text-left text-sm">
          <thead class="bg-zinc-800 text-zinc-300">
            <tr>
              <th class="px-4 py-3">Date</th>
              <th class="px-4 py-3">Total Items Sold</th>
              <th class="px-4 py-3">Total Sales</th>
              <th class="px-4 py-3">Action</th>
            </tr>
          </thead>

          <tbody>
            <template v-for="day in groupedSales" :key="day.date">
              <tr class="border-t border-white/10 text-zinc-300">
                <td class="px-4 py-3 font-bold text-white">{{ day.date }}</td>
                <td class="px-4 py-3">{{ day.totalQty }}</td>
                <td class="px-4 py-3 font-bold text-red-400">
                  ₱{{ day.totalAmount.toFixed(2) }}
                </td>
                <td class="px-4 py-3">
                  <button
                    class="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
                    @click="toggleDay(day.date)"
                  >
                    {{ openedDay === day.date ? 'Hide Details' : 'View Sales' }}
                  </button>
                </td>
              </tr>

              <tr v-if="openedDay === day.date">
  <td colspan="4" class="bg-zinc-950 px-4 py-4">
    <div class="space-y-4">
      <div
  v-for="order in day.orders"
  :key="order.id"
  class="rounded-2xl border border-white/10 bg-black p-4"
>
  <div class="mb-3 flex items-center justify-between">
    <div>
      <h3 class="font-bold text-white">Order #{{ order.id }}</h3>
      <p class="text-xs text-zinc-400">Date: {{ day.date }}</p>
      <p class="text-xs text-zinc-400">Time: {{ formatTime(order.time) }}</p>
    </div>

    <div class="flex items-center gap-4">
      <div class="text-right">
        <p class="text-xs text-zinc-400">Order Total</p>
        <p class="font-bold text-red-400">
          ₱{{ Number(order.totalAmount || 0).toFixed(2) }}
        </p>
      </div>

      <button
        class="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
        @click="toggleOrder(order.id)"
      >
        {{ openedOrder === order.id ? 'Hide Details' : 'Show Details' }}
      </button>
    </div>
  </div>

  <div
    v-if="openedOrder === order.id"
    class="overflow-x-auto rounded-xl border border-white/10"
  >
    <table class="w-full text-left text-xs">
      <thead class="bg-zinc-900 text-zinc-400">
        <tr>
          <th class="px-3 py-2">Product</th>
          <th class="px-3 py-2">Qty</th>
          <th class="px-3 py-2">Price</th>
          <th class="px-3 py-2">Subtotal</th>
        </tr>
      </thead>

      <tbody>
        <tr
          v-for="item in order.items"
          :key="item.id"
          class="border-t border-white/10 text-zinc-300"
        >
          <td class="px-3 py-2 font-bold text-white">
            {{ item.product_name || 'Unknown Product' }}
          </td>

          <td class="px-3 py-2">
            {{ item.quantity || 0 }}
          </td>

          <td class="px-3 py-2">
            ₱{{ Number(item.price || 0).toFixed(2) }}
          </td>

          <td class="px-3 py-2 text-red-400">
            ₱{{ Number(item.subtotal || 0).toFixed(2) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
    </div>
  </td>
</tr>
            </template>

            <tr v-if="!loading && groupedSales.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-zinc-500">
                No sales record found for this cashier in the last 30 days.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import MyProfile from '../../components/MyProfile.vue'
import { supabase } from '../../lib/supabase'

const activeTab = ref('profile')
const sales = ref([])
const loading = ref(false)
const salesError = ref('')
const openedDay = ref(null)

const openedOrder = ref(null)

function toggleOrder(orderId) {
  openedOrder.value = openedOrder.value === orderId ? null : orderId
}

const groupedSales = computed(() => {
  const groups = {}

  sales.value.forEach(sale => {
    const date = formatDate(sale.created_at)
    const orderTotal = Number(sale.total_amount || sale.total || 0)
    const orderItems = sale.sale_items || []

    if (!groups[date]) {
      groups[date] = {
        date,
        totalQty: 0,
        totalAmount: 0,
        orders: [],
      }
    }

    const orderQty = orderItems.reduce((sum, item) => {
      return sum + Number(item.quantity || 0)
    }, 0)

    groups[date].totalQty += orderQty
    groups[date].totalAmount += orderTotal

    groups[date].orders.push({
      id: sale.id,
      time: sale.created_at,
      totalQty: orderQty,
      totalAmount: orderTotal,
      payment_method: sale.payment_method || 'Cash',
      items: orderItems,
    })
  })

  return Object.values(groups)
})

async function openSalesTab() {
  activeTab.value = 'sales'
  await fetchSales()
}

async function fetchSales() {
  loading.value = true
  salesError.value = ''
  openedDay.value = null

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data, error } = await supabase.rpc('list_my_sales_since', {
    p_since: thirtyDaysAgo.toISOString(),
  })

  if (error) {
    salesError.value = error.message
    sales.value = []
    loading.value = false
    return
  }

  // the server already returns only this cashier's own sales
  sales.value = data || []

  loading.value = false
}

function toggleDay(date) {
  openedDay.value = openedDay.value === date ? null : date
}

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTime(date) {
  if (!date) return ''

  return new Date(date).toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>