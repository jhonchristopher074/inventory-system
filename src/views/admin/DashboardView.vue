<template>
  <div>
    <PageHeader
      title="Dashboard"
      subtitle="Monitor products, stock level, categories, and inspection schedules."
    />

    <p v-if="loading" class="mb-3 text-sm text-zinc-400">Loading dashboard...</p>

    <p v-if="errorMessage" class="mb-4 rounded-xl bg-red-600/20 p-3 text-sm text-red-400">
      {{ errorMessage }}
    </p>

    <section class="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Total Products</p>
        <h2 class="text-2xl font-bold text-white">{{ totalProducts }}</h2>
      </div>

      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Low Stock</p>
        <h2 class="text-2xl font-bold text-white">{{ lowStock }}</h2>
      </div>

      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Categories</p>
        <h2 class="text-2xl font-bold text-white">{{ categoryCount }}</h2>
      </div>

      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Schedules</p>
        <h2 class="text-2xl font-bold text-white">{{ inspectionProducts.length }}</h2>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div class="rounded-[26px] border border-white/10 bg-zinc-900 p-4 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-wider text-zinc-400">
              Quick Preview
            </p>
            <h2 class="text-2xl font-bold text-white">Products</h2>
          </div>

          <RouterLink
            to="/inventory"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Open Inventory
          </RouterLink>
        </div>

        <div v-if="products.length === 0 && !loading" class="text-sm text-zinc-500">
          No products found.
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div
            v-for="product in products.slice(0, 4)"
            :key="product.id"
            class="rounded-[22px] border border-white/10 bg-black p-4"
          >
            <img
              :src="product.image_url || 'https://via.placeholder.com/300x200'"
              :alt="product.name"
              class="mb-3 h-24 w-full rounded-2xl object-cover"
            />

            <h3 class="mb-1 text-lg font-bold text-white">{{ product.name }}</h3>
            <p class="text-sm text-red-400">{{ product.category }}</p>
            <p class="mt-1 text-sm text-zinc-300">Qty: {{ product.quantity }}</p>
          </div>
        </div>
      </div>

      <div class="rounded-[26px] border border-white/10 bg-zinc-900 p-4 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-wider text-zinc-400">
              Schedule
            </p>
            <h2 class="text-2xl font-bold text-white">Calendar Preview</h2>
          </div>

          <RouterLink
            to="/calendar"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Open Calendar
          </RouterLink>
        </div>

        <div v-if="inspectionProducts.length === 0 && !loading" class="text-sm text-zinc-500">
          No inspection schedules.
        </div>

        <div class="space-y-2">
          <div
            v-for="item in inspectionProducts.slice(0, 4)"
            :key="item.id"
            class="rounded-[22px] border border-white/10 bg-black p-3"
            :class="isOverdue(item) ? 'border-red-500/50 bg-red-950/20' : ''"
          >
            <p class="text-sm font-bold text-white">
              {{ formatDate(item.inspection_date) }}
            </p>

            <p class="text-xs text-red-400">{{ item.category }}</p>

            <div class="mt-1 flex items-center justify-between gap-2">
              <div>
                <p class="text-sm text-zinc-300">{{ item.name }}</p>
                <p class="text-[11px] text-zinc-400">
                  Inspected: {{ currentInspected(item) }} / {{ item.quantity }}
                </p>
              </div>

              <span
                v-if="isOverdue(item)"
                class="rounded-full bg-red-600/20 px-2 py-[2px] text-[10px] font-bold text-red-400"
              >
                Overdue
              </span>

              <span
                v-else-if="item.return_count > 0"
                class="rounded-full bg-red-600/20 px-2 py-[2px] text-[10px] font-bold text-red-400"
              >
                Return
              </span>

              <span
                v-else-if="currentInspected(item) >= item.quantity"
                class="rounded-full bg-emerald-600/20 px-2 py-[2px] text-[10px] font-bold text-emerald-400"
              >
                Done
              </span>

              <span
                v-else
                class="rounded-full bg-yellow-500/20 px-2 py-[2px] text-[10px] font-bold text-yellow-400"
              >
                Pending
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../../lib/supabase'
import PageHeader from '../../components/PageHeader.vue'

const products = ref([])
const loading = ref(false)
const errorMessage = ref('')

const totalProducts = computed(() => products.value.length)

const lowStock = computed(() =>
  products.value.filter((product) => Number(product.quantity || 0) <= 10).length
)

const categoryCount = computed(() =>
  new Set(products.value.map((product) => product.category)).size
)

const inspectionProducts = computed(() =>
  products.value
    .filter((product) => shouldShowInCalendarPreview(product))
    .sort((a, b) => new Date(a.inspection_date) - new Date(b.inspection_date))
)

function getToday() {
  return new Date().toISOString().split('T')[0]
}

function currentInspected(product) {
  return Number(product.approved_count || 0) + Number(product.return_count || 0)
}

function isOverdue(product) {
  const inspected = currentInspected(product)
  const quantity = Number(product.quantity || 0)

  return product.inspection_date < getToday() && inspected < quantity
}

function shouldShowInCalendarPreview(product) {
  if (!product.inspection_date) return false

  const today = getToday()
  const inspected = currentInspected(product)
  const quantity = Number(product.quantity || 0)

  const isTodayOrFuture = product.inspection_date >= today
  const isPastButUnfinished = product.inspection_date < today && inspected < quantity

  return isTodayOrFuture || isPastButUnfinished
}

async function fetchProducts() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_archived', false)
    .eq('is_deleted', false)
    .order('id', { ascending: true })

  if (error) {
    errorMessage.value = error.message
  } else {
    products.value = data || []
  }

  loading.value = false
}

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

onMounted(fetchProducts)
</script>