<template>
  <div>
    <PageHeader title="Cashier Profile" subtitle="Manage cashier account information." />

    <!-- TABS -->
    <div class="mb-5 flex gap-3 rounded-[20px] border border-white/10 bg-zinc-900 p-2">
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

    <!-- PROFILE SETTINGS -->
    <div
      v-if="activeTab === 'profile'"
      class="max-w-[760px] rounded-[24px] border border-white/10 bg-zinc-900 p-6"
    >
      <p v-if="profileError" class="mb-4 rounded-xl bg-red-600/20 p-3 text-red-400">
        {{ profileError }}
      </p>

      <div class="mb-6 flex items-center gap-4">
        <div class="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 text-3xl font-extrabold text-white">
          {{ initials }}
        </div>

        <div>
          <h2 class="text-2xl font-extrabold text-white">
            {{ profile.full_name || 'No name found' }}
          </h2>
          <p class="text-sm text-zinc-400">
            {{ profile.email || 'No email found' }}
          </p>
          <span class="mt-2 inline-block rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
            {{ profile.role || 'cashier' }}
          </span>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="info-box">
          <p class="label-text">Full Name</p>
          <p class="value-text">{{ profile.full_name || 'No name found' }}</p>
        </div>

        <div class="info-box">
          <p class="label-text">Email</p>
          <p class="value-text">{{ profile.email || 'No email found' }}</p>
        </div>

        <div class="info-box">
          <p class="label-text">Role</p>
          <p class="value-text capitalize">{{ profile.role || 'cashier' }}</p>
        </div>

        <div class="info-box">
          <p class="label-text">Status</p>
          <p class="font-bold text-emerald-400">
            {{ profile.disabled ? 'Disabled' : 'Active' }}
          </p>
        </div>
      </div>

      <div class="mt-6 rounded-2xl bg-black p-5">
        <h3 class="mb-4 text-xl font-bold text-white">Change Password</h3>

        <input
          v-model="newPassword"
          type="password"
          placeholder="New Password"
          class="input"
        />

        <button
          class="mt-4 rounded-xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
          @click="updatePassword"
        >
          Update Password
        </button>
      </div>
    </div>

    <!-- SALES HISTORY -->
    <div
      v-if="activeTab === 'sales'"
      class="rounded-[24px] border border-white/10 bg-zinc-900 p-5"
    >
      <div class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold text-white">Daily Sales History</h2>
          <p class="text-sm text-zinc-400">
            Shows only {{ profile.full_name || 'this cashier' }}'s total sales per day for the last 30 days.
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
import { computed, onMounted, ref } from 'vue'
import PageHeader from '../../components/PageHeader.vue'
import { supabase } from '../../lib/supabase'

const activeTab = ref('profile')
const sales = ref([])
const loading = ref(false)
const salesError = ref('')
const profileError = ref('')
const newPassword = ref('')
const openedDay = ref(null)

const openedOrder = ref(null)

function toggleOrder(orderId) {
  openedOrder.value = openedOrder.value === orderId ? null : orderId
}

const profile = ref({
  id: '',
  full_name: '',
  email: '',
  role: 'cashier',
  disabled: false,
})

const initials = computed(() => {
  return (profile.value.full_name || profile.value.email || 'User')
    .split(' ')
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
})

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


function getLocalUser() {
  const keys = [
    'currentUser',
    'loggedInUser',
    'user',
    'profile',
    'authUser',
  ]

  for (const key of keys) {
    const raw = localStorage.getItem(key)

    if (!raw) continue

    try {
      const parsed = JSON.parse(raw)
      if (parsed?.email || parsed?.id) return parsed
    } catch {
      // ignore
    }
  }

  return {
    id: localStorage.getItem('user_id') || localStorage.getItem('profile_id') || '',
    full_name: localStorage.getItem('full_name') || localStorage.getItem('name') || '',
    email: localStorage.getItem('email') || localStorage.getItem('user_email') || '',
    role: localStorage.getItem('role') || 'cashier',
  }
}

async function fetchProfile() {
  profileError.value = ''

  const localUser = getLocalUser()

  let query = supabase.from('profiles').select('*')

  if (localUser.email) {
    query = query.eq('email', localUser.email)
  } else if (localUser.id) {
    query = query.eq('id', localUser.id)
  } else {
    profileError.value = 'No logged-in user found. Please check your login localStorage.'
    return
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    profileError.value = error.message
    return
  }

  if (data) {
    profile.value = data
  } else {
    profile.value = {
      id: localUser.id || '',
      full_name: localUser.full_name || '',
      email: localUser.email || '',
      role: localUser.role || 'cashier',
      disabled: false,
    }

    profileError.value = 'Profile not found in profiles table, using local login data.'
  }
}

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

  const { data, error } = await supabase
    .from('sales')
    .select(`
      *,
      sale_items (
        id,
        product_id,
        product_name,
        quantity,
        price,
        subtotal
      )
    `)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    salesError.value = error.message
    sales.value = []
    loading.value = false
    return
  }

  const email = String(profile.value.email || '').toLowerCase()
  const name = String(profile.value.full_name || '').toLowerCase()
  const id = String(profile.value.id || '')

  sales.value = (data || []).filter(sale => {
    const saleCashierId = String(sale.cashier_id || '')
    const saleCashierEmail = String(sale.cashier_email || '').toLowerCase()
    const saleCashierName = String(sale.cashier_name || '').toLowerCase()

    return (
      (id && saleCashierId === id) ||
      (email && saleCashierEmail === email) ||
      (name && saleCashierName === name)
    )
  })

  loading.value = false
}

function toggleDay(date) {
  openedDay.value = openedDay.value === date ? null : date
}

async function updatePassword() {
  if (!newPassword.value.trim()) {
    alert('Please enter a new password.')
    return
  }

  if (!profile.value.id) {
    alert('No profile ID found.')
    return
  }

  const { error } = await supabase
    .from('profiles')
    .update({ password: newPassword.value })
    .eq('id', profile.value.id)

  if (error) {
    alert(error.message)
    return
  }

  newPassword.value = ''
  alert('Password updated.')
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

onMounted(async () => {
  await fetchProfile()
})
</script>

<style scoped>
.info-box {
  border-radius: 1rem;
  background: #000;
  padding: 1rem;
}

.label-text {
  margin-bottom: 0.35rem;
  font-size: 0.85rem;
  color: rgb(161 161 170);
}

.value-text {
  font-weight: 800;
  color: white;
}

.input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgb(39 39 42);
  padding: 0.9rem 1rem;
  color: white;
  outline: none;
}

.input:focus {
  border-color: rgb(239 68 68);
}
</style>