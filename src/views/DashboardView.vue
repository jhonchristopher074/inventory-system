<template>
  <div>
    <header
      class="mb-5 flex items-center justify-between rounded-[22px] border border-white/10 bg-gradient-to-br from-red-500/15 via-red-500/5 to-white/5 p-5"
    >
      <div>
        <p
          class="mb-2 inline-block rounded-full bg-red-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-red-200"
        >
          Modern Red Theme
        </p>
        <h1 class="mb-1 text-3xl font-extrabold text-white">Dashboard Overview</h1>
        <p class="text-sm text-zinc-400">
          Monitor products, stock level, categories, and inspection schedules in one modern view.
        </p>
      </div>

      <div class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
        Live Inventory
      </div>
    </header>

    <section class="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      <div class="rounded-xl border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Total Products</p>
        <h2 class="text-2xl font-bold text-white">{{ totalProducts }}</h2>
      </div>

      <div class="rounded-xl border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Low Stock</p>
        <h2 class="text-2xl font-bold text-white">{{ lowStock }}</h2>
      </div>

      <div class="rounded-xl border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Categories</p>
        <h2 class="text-2xl font-bold text-white">{{ categoryCount }}</h2>
      </div>

      <div class="rounded-xl border border-white/10 bg-zinc-900 p-4">
        <p class="text-xs text-zinc-400">Schedules</p>
        <h2 class="text-2xl font-bold text-white">{{ inspectionCount }}</h2>
      </div>
    </section>

    <section class="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-wider text-zinc-400">Quick Preview</p>
            <h2 class="text-2xl font-bold text-white">Products</h2>
          </div>

          <RouterLink
            to="/inventory"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Open Inventory
          </RouterLink>
        </div>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div
            v-for="product in products.slice(0, 4)"
            :key="product.id"
            class="rounded-2xl border border-white/10 bg-black p-4"
          >
            <h3 class="mb-1 text-xl font-bold text-white">{{ product.name }}</h3>
            <p class="text-sm text-zinc-400">{{ product.category }}</p>
            <p class="mt-2 text-sm text-zinc-300">Qty: {{ product.qty }}</p>
          </div>
        </div>
      </div>

      <div class="rounded-[22px] border border-white/10 bg-zinc-900 p-4 shadow-xl">
        <div class="mb-4 flex items-center justify-between">
          <div>
            <p class="text-[11px] uppercase tracking-wider text-zinc-400">Schedule</p>
            <h2 class="text-2xl font-bold text-white">Calendar Preview</h2>
          </div>

          <RouterLink
            to="/calendar"
            class="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          >
            Open Calendar
          </RouterLink>
        </div>

        <div class="space-y-3">
          <div
            v-for="item in inspectionProducts"
            :key="item.id"
            class="rounded-2xl border border-white/10 bg-black p-4"
          >
            <p class="mb-1 text-lg font-bold text-white">
              {{ formatDate(item.inspectionDate) }}
            </p>
            <p class="mb-1 text-sm text-red-400">{{ item.category }}</p>
            <p class="text-sm text-zinc-300">{{ item.name }}</p>
          </div>

          <p v-if="inspectionProducts.length === 0" class="text-sm text-zinc-500">
            No inspection schedules yet.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { products } from '../data/products'

const totalProducts = computed(() => products.length)
const lowStock = computed(() => products.filter((p) => p.qty <= 10).length)
const categoryCount = computed(() => new Set(products.map((p) => p.category)).size)
const inspectionCount = computed(() => products.filter((p) => p.inspectionDate).length)
const inspectionProducts = computed(() => products.filter((p) => p.inspectionDate))

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>