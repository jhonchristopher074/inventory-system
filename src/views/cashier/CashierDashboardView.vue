<template>
  <div>
    <!-- HEADER -->
    <div class="mb-6 rounded-[24px] border border-white/10 bg-zinc-900 p-5">
      <h1 class="text-3xl font-extrabold text-white">
        Cashier Dashboard
      </h1>

      <p class="text-zinc-400">
        Monitor sales, transactions, and cashier activities.
      </p>
    </div>

    <!-- STATS -->
    <div class="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <div class="stat-card">
        <p class="stat-label">Today's Sales</p>

        <h2 class="stat-value text-red-400">
          ₱{{ todaySales.toFixed(2) }}
        </h2>
      </div>

      <div class="stat-card">
        <p class="stat-label">Transactions</p>

        <h2 class="stat-value">
          {{ totalTransactions }}
        </h2>
      </div>

      <div class="stat-card">
        <p class="stat-label">Products Sold</p>

        <h2 class="stat-value">
          {{ totalProductsSold }}
        </h2>
      </div>

      <div class="stat-card">
        <p class="stat-label">Available Products</p>

        <h2 class="stat-value">
          {{ availableProducts }}
        </h2>
      </div>
    </div>

    <!-- MAIN GRID -->
    <div class="grid gap-6 xl:grid-cols-[1fr_400px]">
      <!-- RECENT SALES -->
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div class="mb-5 flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold text-white">
              Recent Sales
            </h2>

            <p class="text-sm text-zinc-400">
              Latest cashier transactions
            </p>
          </div>

          <RouterLink
            to="/cashier/sales"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            View All
          </RouterLink>
        </div>

        <div class="space-y-4">
          <div
            v-for="sale in recentSales"
            :key="sale.id"
            class="rounded-2xl bg-black p-4 transition hover:border-l-4 hover:border-l-blue-500"
          >
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-lg font-bold text-white">
                  Sale #{{ sale.id }}
                </h3>

                <p class="text-sm text-zinc-400">
                  {{ formatDate(sale.created_at) }}
                </p>
              </div>

              <p class="text-xl font-extrabold text-red-400">
                ₱{{ Number(sale.total_amount).toFixed(2) }}
              </p>
            </div>

            <div class="mt-4 space-y-2">
              <div
                v-for="item in sale.sale_items.slice(0, 2)"
                :key="item.id"
                class="flex justify-between rounded-xl bg-zinc-900 p-3"
              >
                <div>
                  <p class="font-bold text-white">
                    {{ item.product_name }}
                  </p>

                  <p class="text-xs text-zinc-400">
                    Qty: {{ item.quantity }}
                  </p>
                </div>

                <p class="font-bold text-white">
                  ₱{{ Number(item.subtotal).toFixed(2) }}
                </p>
              </div>
            </div>
          </div>

          <p
            v-if="recentSales.length === 0"
            class="text-center text-zinc-500"
          >
            No recent sales.
          </p>
        </div>
      </div>

      <!-- QUICK ACTIONS -->
      <div class="space-y-6">
        <!-- QUICK ACCESS -->
        <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
          <h2 class="mb-4 text-2xl font-bold text-white">
            Quick Access
          </h2>

          <div class="grid gap-4">
            <RouterLink
              to="/cashier/pos"
              class="quick-card"
            >
              <div>
                <h3 class="text-xl font-bold text-white">
                  Open POS
                </h3>

                <p class="text-sm text-zinc-400">
                  Start cashier transaction
                </p>
              </div>
            </RouterLink>

            <RouterLink
              to="/cashier/sales"
              class="quick-card"
            >
              <div>
                <h3 class="text-xl font-bold text-white">
                  Sales Records
                </h3>

                <p class="text-sm text-zinc-400">
                  View completed transactions
                </p>
              </div>
            </RouterLink>
          </div>
        </div>

        <!-- LOW STOCK -->
        <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
          <h2 class="mb-4 text-2xl font-bold text-white">
            Low Stock Products
          </h2>

          <div class="space-y-3">
            <div
              v-for="product in lowStockProducts"
              :key="product.id"
              class="rounded-2xl bg-black p-4"
            >
              <div class="flex justify-between">
                <div>
                  <h3 class="font-bold text-white">
                    {{ product.name }}
                  </h3>

                  <p class="text-sm text-zinc-400">
                    {{ product.category }}
                  </p>
                </div>

                <div class="text-right">
                  <p class="font-bold text-red-400">
                    {{ product.quantity }}
                  </p>

                  <p class="text-xs text-zinc-500">
                    Remaining
                  </p>
                </div>
              </div>
            </div>

            <p
              v-if="lowStockProducts.length === 0"
              class="text-center text-zinc-500"
            >
              No low stock products.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'

const recentSales = ref([])
const lowStockProducts = ref([])

const todaySales = ref(0)
const totalTransactions = ref(0)
const totalProductsSold = ref(0)
const availableProducts = ref(0)

async function fetchDashboard() {
  await Promise.all([
    fetchSales(),
    fetchProducts(),
  ])
}

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

  const cashierSales = data || []

  recentSales.value = cashierSales.slice(0, 5)
  totalTransactions.value = cashierSales.length

  const today = new Date().toDateString()

  todaySales.value = cashierSales
    .filter(sale => new Date(sale.created_at).toDateString() === today)
    .reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)

  totalProductsSold.value = cashierSales.reduce((sum, sale) => {
    const qty = sale.sale_items?.reduce((itemSum, item) => {
      return itemSum + Number(item.quantity || 0)
    }, 0)

    return sum + qty
  }, 0)
}

async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)

  if (error) {
    console.error(error)
    return
  }

  availableProducts.value = data?.length || 0

  lowStockProducts.value = data
    ?.filter(product => Number(product.quantity) <= 10)
    .slice(0, 5)
}

function formatDate(date) {
  return new Date(date).toLocaleString()
}

onMounted(fetchDashboard)
</script>

<style scoped>
.stat-card {
  border-radius: 24px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgb(24 24 27);
  padding: 20px;
}

.stat-label {
  margin-bottom: 12px;
  font-size: 14px;
  color: rgb(161 161 170);
}

.stat-value {
  font-size: 36px;
  font-weight: 800;
  color: white;
}

.quick-card {
  border-radius: 20px;
  background: black;
  padding: 20px;
  transition: 0.2s;
}

.quick-card:hover {
  border-left: 4px solid rgb(59 130 246);
  background: rgb(39 39 42);
}
</style>