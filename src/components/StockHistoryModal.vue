<script setup>
// Stock history (admin): every change to stock, recorded by the database,
// including changes made by the receipt scanner (n8n).
// With a product: that product's history. Without: recent changes to all.
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'

const props = defineProps({
  product: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const movements = ref([])
const loading = ref(false)
const errorMessage = ref('')

async function fetchMovements() {
  loading.value = true
  errorMessage.value = ''

  const { data, error } = await supabase.rpc('list_stock_movements', {
    p_product_id: props.product ? props.product.id : null,
    p_limit: 200,
  })

  loading.value = false

  if (error) {
    errorMessage.value = error.message
    movements.value = []
    return
  }

  movements.value = data || []
}

function formatDateTime(date) {
  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatChange(change) {
  const value = Number(change || 0)
  return value > 0 ? `+${count(value)}` : count(value)
}

onMounted(fetchMovements)
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <!-- min-w-0: the box may shrink to a phone screen; the table scrolls -->
      <div class="flex max-h-[90vh] w-full min-w-0 max-w-4xl flex-col rounded-[28px] border border-white/10 bg-[#18181b] p-4 shadow-2xl sm:p-6">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="text-2xl font-extrabold text-white">Stock History</h2>
            <p class="truncate text-sm text-zinc-400">
              {{ product ? product.name : 'Latest stock changes for all products' }}
            </p>
          </div>

          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <p v-if="loading" class="py-6 text-sm text-zinc-400">Loading history...</p>

        <p v-if="errorMessage" class="rounded-xl bg-red-600/20 p-4 text-sm text-red-400">
          {{ errorMessage }}
        </p>

        <p
          v-if="!loading && !errorMessage && movements.length === 0"
          class="py-6 text-sm text-zinc-500"
        >
          No stock changes recorded yet. Changes are recorded from the day the stock history was switched on.
        </p>

        <div v-if="movements.length > 0" class="overflow-auto rounded-2xl border border-white/10">
          <table class="w-full text-left text-sm">
            <thead class="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th class="px-4 py-3">When</th>
                <th v-if="!product" class="px-4 py-3">Product</th>
                <th class="px-4 py-3 text-right">Change</th>
                <th class="px-4 py-3 text-right">Stock</th>
                <th class="px-4 py-3">Reason</th>
                <th class="px-4 py-3">By</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="move in movements"
                :key="move.id"
                class="border-t border-white/5 text-zinc-300"
              >
                <td class="whitespace-nowrap px-4 py-3">{{ formatDateTime(move.created_at) }}</td>
                <td v-if="!product" class="px-4 py-3 text-white">{{ move.product_name }}</td>
                <td
                  class="whitespace-nowrap px-4 py-3 text-right font-bold"
                  :class="Number(move.change) > 0 ? 'text-emerald-400' : 'text-red-400'"
                >
                  {{ formatChange(move.change) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-zinc-400">
                  {{ count(move.old_quantity) }} → <span class="font-bold text-white">{{ count(move.new_quantity) }}</span>
                </td>
                <td class="px-4 py-3">{{ move.reason }}</td>
                <td class="px-4 py-3">{{ move.changed_by_name || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Teleport>
</template>
