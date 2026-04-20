<template>
  <div>
    <header class="mb-6 rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl">
      <h1 class="mb-2 text-3xl font-extrabold text-white">Calendar</h1>
      <p class="text-sm text-zinc-400">
        View all products scheduled for inspection by day.
      </p>
    </header>

    <div
      v-if="groupedInspectionDates.length === 0"
      class="rounded-2xl border border-white/10 bg-zinc-900 p-5 text-zinc-400"
    >
      No inspection schedules yet.
    </div>

    <div v-else class="space-y-5">
      <div
        v-for="group in groupedInspectionDates"
        :key="group.date"
        class="rounded-[22px] border border-white/10 bg-zinc-900 p-5 shadow-xl"
      >
        <div class="mb-4">
          <h2 class="text-2xl font-bold text-white">{{ formatDate(group.date) }}</h2>
          <p class="text-sm text-zinc-400">
            {{ group.items.length }} product(s) scheduled
          </p>
        </div>

        <div class="space-y-3">
          <div
            v-for="item in group.items"
            :key="item.id"
            class="rounded-2xl border border-white/10 bg-black p-4"
          >
            <div class="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-lg font-bold text-white">{{ item.name }}</p>
                <p class="text-sm text-red-400">{{ item.category }}</p>
              </div>

              <button
                class="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                @click="openInspectionPanel(item)"
              >
                Process Inspection
              </button>
            </div>

            <div class="mb-3 flex flex-wrap gap-2">
              <span
                v-if="item.inspected"
                class="rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-bold text-emerald-400"
              >
                Inspected
              </span>

              <span
                v-else
                class="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-bold text-yellow-400"
              >
                Pending
              </span>

              <span
                v-if="item.inspectionResult === 'approved'"
                class="rounded-full bg-blue-600/20 px-3 py-1 text-xs font-bold text-blue-400"
              >
                Approved Product
              </span>

              <span
                v-if="item.inspectionResult === 'return'"
                class="rounded-full bg-red-600/20 px-3 py-1 text-xs font-bold text-red-400"
              >
                Return
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Inspection Confirmation Panel -->
    <div
      v-if="activeItem"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      @click.self="closeInspectionPanel"
    >
      <div class="relative w-full max-w-md rounded-[26px] border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <button
          class="absolute right-4 top-3 text-3xl text-white"
          @click="closeInspectionPanel"
        >
          &times;
        </button>

        <h2 class="mb-3 text-2xl font-bold text-white">Product Inspection</h2>

        <p class="mb-2 text-zinc-300">
          <span class="font-semibold">Product:</span> {{ activeItem.name }}
        </p>

        <p class="mb-2 text-zinc-300">
          <span class="font-semibold">Category:</span> {{ activeItem.category }}
        </p>

        <p class="mb-4 text-zinc-300">
          <span class="font-semibold">Inspection Date:</span>
          {{ formatDate(activeItem.inspectionDate) }}
        </p>

        <div class="mb-4">
          <label class="mb-2 block text-sm font-medium text-zinc-300">
            Inspection Result
          </label>

          <select
            v-model="selectedResult"
            class="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-white outline-none"
          >
            <option value="approved">Approved Product</option>
            <option value="return">Return</option>
          </select>
        </div>

        <div class="flex gap-3">
          <button
            class="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700"
            @click="confirmInspection"
          >
            Confirm Inspection
          </button>

          <button
            class="flex-1 rounded-xl bg-zinc-800 py-3 font-semibold text-white transition hover:bg-zinc-700"
            @click="closeInspectionPanel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { products } from '../data/products'

const activeItem = ref(null)
const selectedResult = ref('')

const groupedInspectionDates = computed(() => {
  const scheduled = products.filter((product) => product.inspectionDate)

  const grouped = scheduled.reduce((acc, product) => {
    const date = product.inspectionDate

    if (!acc[date]) {
      acc[date] = []
    }

    acc[date].push(product)
    return acc
  }, {})

  return Object.keys(grouped)
    .sort((a, b) => new Date(a) - new Date(b))
    .map((date) => ({
      date,
      items: grouped[date],
    }))
})

function formatDate(date) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function openInspectionPanel(item) {
  activeItem.value = item
  selectedResult.value = item.inspectionResult || ''
}

function closeInspectionPanel() {
  activeItem.value = null
  selectedResult.value = ''
}

function confirmInspection() {
  if (!activeItem.value) return

  if (!selectedResult.value) {
    window.alert('Please select an inspection result first.')
    return
  }

  let message = ''

  if (selectedResult.value === 'approved') {
    message = `Confirm "${activeItem.value.name}" as APPROVED PRODUCT?`
  }

  if (selectedResult.value === 'return') {
    message = `Confirm "${activeItem.value.name}" for RETURN to seller?`
  }

  const confirmed = window.confirm(message)

  if (!confirmed) return

  activeItem.value.inspected = true
  activeItem.value.inspectionResult = selectedResult.value

  closeInspectionPanel()
}
</script>