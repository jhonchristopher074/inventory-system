<template>
  <div>
    <PageHeader
      title="Staff Dashboard"
      subtitle="Overview of inspections, inventory, and assigned activities."
    />

    <p v-if="loading" class="text-sm text-zinc-400">Loading dashboard...</p>

    <p
      v-if="errorMessage"
      class="mb-4 rounded-xl bg-red-600/20 p-4 text-red-400"
    >
      {{ errorMessage }}
    </p>

    <!-- SUMMARY CARDS -->
    <div class="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      <div class="dashboard-card">
        <p class="card-label">Total Products</p>
        <h2 class="card-value">{{ totalProducts }}</h2>
        <p class="card-sub">Available inventory records</p>
      </div>

      <div class="dashboard-card">
        <p class="card-label">Low Stock</p>
        <h2 class="card-value text-red-400">{{ lowStockProducts.length }}</h2>
        <p class="card-sub">Products with 5 or fewer stocks</p>
      </div>

      <div class="dashboard-card">
        <p class="card-label">Scheduled Inspections</p>
        <h2 class="card-value text-yellow-400">{{ scheduledInspections.length }}</h2>
        <p class="card-sub">Products with inspection dates</p>
      </div>

      <div class="dashboard-card">
        <p class="card-label">Submitted Approvals</p>
        <h2 class="card-value text-lime-400">{{ submittedApprovals.length }}</h2>
        <p class="card-sub">Waiting for admin approval</p>
      </div>
    </div>

    <!-- INSPECTION STATUS -->
    <div class="mb-6 grid gap-5 lg:grid-cols-3">
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <h2 class="text-xl font-bold text-white">Inspection Status</h2>

        <div class="mt-5 space-y-4">
          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span class="text-zinc-400">Saved Not Submitted</span>
              <span class="font-bold text-lime-400">{{ savedApprovals.length }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-lime-400"
                :style="{ width: savedPercent + '%' }"
              ></div>
            </div>
          </div>

          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span class="text-zinc-400">Submitted to Admin</span>
              <span class="font-bold text-yellow-400">{{ submittedApprovals.length }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-yellow-400"
                :style="{ width: submittedPercent + '%' }"
              ></div>
            </div>
          </div>

          <div>
            <div class="mb-1 flex justify-between text-sm">
              <span class="text-zinc-400">Approved by Admin</span>
              <span class="font-bold text-red-400">{{ approvedProductCount }}</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                class="h-full rounded-full bg-red-600"
                :style="{ width: approvedPercent + '%' }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- NEXT INSPECTIONS -->
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5 lg:col-span-2">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-white">Upcoming Inspections</h2>
            <p class="text-sm text-zinc-400">Nearest scheduled inspection items</p>
          </div>

          <button
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            @click="router.push('/staff/calendar')"
          >
            View Calendar
          </button>
        </div>

        <div v-if="upcomingInspections.length === 0" class="text-sm text-zinc-400">
          No upcoming inspections.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="item in upcomingInspections"
            :key="item.id"
            class="flex items-center justify-between rounded-2xl bg-black p-4"
          >
            <div>
              <h3 class="font-bold text-white">{{ item.name }}</h3>
              <p class="text-sm text-red-400">{{ item.category || 'Uncategorized' }}</p>
              <p class="text-xs text-zinc-400">
                Date: {{ formatDate(item.inspection_date) }}
              </p>
            </div>

            <div class="text-right">
              <p class="text-sm font-bold text-white">
                Qty: {{ item.quantity }}
              </p>
              <p class="text-xs text-yellow-400">
                Remaining: {{ remainingInspection(item) }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- LOWER SECTION -->
    <div class="grid gap-5 lg:grid-cols-2">
      <!-- LOW STOCK -->
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <h2 class="text-xl font-bold text-white">Low Stock Products</h2>
            <p class="text-sm text-zinc-400">Products that need attention</p>
          </div>
        </div>

        <div v-if="lowStockProducts.length === 0" class="text-sm text-zinc-400">
          No low stock products.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="item in lowStockProducts.slice(0, 5)"
            :key="item.id"
            class="flex items-center justify-between rounded-2xl bg-black p-4"
          >
            <div>
              <h3 class="font-bold text-white">{{ item.name }}</h3>
              <p class="text-sm text-red-400">{{ item.category || 'Uncategorized' }}</p>
            </div>

            <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
              Qty: {{ item.quantity }}
            </span>
          </div>
        </div>
      </div>

      <!-- SAVED / SUBMITTED ACTIVITY -->
      <div class="rounded-[24px] border border-white/10 bg-zinc-900 p-5">
        <h2 class="text-xl font-bold text-white">Recent Inspection Activity</h2>
        <p class="text-sm text-zinc-400">Saved and submitted inspection records</p>

        <div v-if="recentApprovals.length === 0" class="mt-4 text-sm text-zinc-400">
          No recent inspection activity.
        </div>

        <div v-else class="mt-4 space-y-3">
          <div
            v-for="item in recentApprovals"
            :key="item.id"
            class="rounded-2xl bg-black p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-bold text-white">{{ item.product_name }}</h3>
                <p class="text-xs text-zinc-400">
                  By: {{ item.requested_by || 'Staff' }}
                </p>
              </div>

              <span
                class="rounded-full px-3 py-1 text-xs font-bold"
                :class="item.status === 'submitted'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-lime-500/20 text-lime-400'"
              >
                {{ item.status }}
              </span>
            </div>

            <div class="mt-3 flex gap-2">
              <span class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400">
                Approved: {{ item.approved_qty || 0 }}
              </span>

              <span class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400">
                Return: {{ item.return_qty || 0 }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- REFRESH -->
    <div class="mt-6 flex justify-end">
      <button
        class="rounded-2xl bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700"
        @click="fetchDashboard"
      >
        Refresh
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const router = useRouter()

const loading = ref(false)
const errorMessage = ref('')

const products = ref([])
const approvals = ref([])

onMounted(() => {
  fetchDashboard()
})

async function fetchDashboard() {
  loading.value = true
  errorMessage.value = ''

  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })

  if (productError) {
    errorMessage.value = productError.message
    loading.value = false
    return
  }

  const { data: approvalData, error: approvalError } = await supabase
    .from('inspection_approvals')
    .select('*')
    .in('status', ['saved', 'submitted'])
    .order('created_at', { ascending: false })

  if (approvalError) {
    errorMessage.value = approvalError.message
    loading.value = false
    return
  }

  products.value = productData || []
  approvals.value = approvalData || []
  loading.value = false
}

const totalProducts = computed(() => {
  return products.value.length
})

const lowStockProducts = computed(() => {
  return products.value.filter(item => Number(item.quantity || 0) <= 5)
})

const scheduledInspections = computed(() => {
  return products.value.filter(item => item.inspection_date)
})

const savedApprovals = computed(() => {
  return approvals.value.filter(item => item.status === 'saved')
})

const submittedApprovals = computed(() => {
  return approvals.value.filter(item => item.status === 'submitted')
})

const recentApprovals = computed(() => {
  return approvals.value.slice(0, 5)
})

const approvedProductCount = computed(() => {
  return products.value.reduce((sum, item) => {
    return sum + Number(item.approved_count || 0) + Number(item.return_count || 0)
  }, 0)
})

const totalApprovalRecords = computed(() => {
  return savedApprovals.value.length + submittedApprovals.value.length + approvedProductCount.value
})

const savedPercent = computed(() => {
  return percent(savedApprovals.value.length, totalApprovalRecords.value)
})

const submittedPercent = computed(() => {
  return percent(submittedApprovals.value.length, totalApprovalRecords.value)
})

const approvedPercent = computed(() => {
  return percent(approvedProductCount.value, totalApprovalRecords.value)
})

const upcomingInspections = computed(() => {
  const today = new Date().toISOString().split('T')[0]

  return scheduledInspections.value
    .filter(item => item.inspection_date >= today)
    .sort((a, b) => new Date(a.inspection_date) - new Date(b.inspection_date))
    .slice(0, 5)
})

function remainingInspection(product) {
  const approved = Number(product.approved_count || 0)
  const returned = Number(product.return_count || 0)

  const pending = approvals.value
    .filter(item => item.product_id === product.id)
    .reduce((sum, item) => {
      return sum + Number(item.approved_qty || 0) + Number(item.return_qty || 0)
    }, 0)

  return Math.max(Number(product.quantity || 0) - approved - returned - pending, 0)
}

function percent(value, total) {
  if (!total) return 0

  return Math.min(Math.round((Number(value || 0) / Number(total || 1)) * 100), 100)
}

function formatDate(date) {
  if (!date) return 'No date'

  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<style scoped>
.dashboard-card {
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgb(24 24 27);
  padding: 1.25rem;
}

.card-label {
  font-size: 0.875rem;
  color: rgb(161 161 170);
}

.card-value {
  margin-top: 0.35rem;
  font-size: 2.25rem;
  font-weight: 900;
  color: white;
}

.card-sub {
  margin-top: 0.35rem;
  font-size: 0.75rem;
  color: rgb(113 113 122);
}
</style>