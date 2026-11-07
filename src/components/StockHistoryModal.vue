<script setup>
// Stock history (admin): every change to stock, recorded by the database,
// including changes made by the receipt scanner (n8n).
// With a product: that product's history. Without: recent changes to all.
// Short rows, a search, and 10 / 15 / all a page, so it never runs long.
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'
import { usePagination } from '../lib/usePagination'
import TablePager from './TablePager.vue'

const props = defineProps({
  product: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const movements = ref([])
const loading = ref(false)
const errorMessage = ref('')
const search = ref('')

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

const shown = computed(() => {
  const words = search.value.trim().toLowerCase()
  if (!words) return movements.value
  return movements.value.filter((move) =>
    `${move.product_name || ''} ${move.reason || ''} ${move.changed_by_name || ''}`.toLowerCase().includes(words)
  )
})

const tableTop = ref(null)
const { page, pageSize, visible, reset } = usePagination(shown, { storageKey: 'stockHistory', scrollTarget: tableTop })
watch(search, reset)

// "Nov 7, 3:17 PM" (the year only when it isn't this year)
function formatDateTime(date) {
  const d = new Date(date)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
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
      <div class="flex max-h-[90vh] w-full min-w-0 max-w-4xl flex-col rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:p-6">
        <div class="mb-4 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 class="text-2xl font-extrabold text-white">Stock History</h2>
            <p class="truncate text-sm text-zinc-400">
              {{ product ? product.name : 'Latest stock changes for all products' }}
            </p>
          </div>

          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <input
          v-if="movements.length > 10"
          v-model="search"
          type="search"
          maxlength="80"
          :placeholder="product ? 'Search reason or person…' : 'Search product, reason or person…'"
          aria-label="Search the stock history"
          class="mb-3 w-full rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
        />

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

        <div v-if="movements.length > 0" ref="tableTop" class="min-h-0 overflow-auto rounded-2xl border border-white/10">
          <table class="w-full text-left text-sm">
            <thead class="sticky top-0 bg-zinc-950 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th class="px-3 py-2.5">When</th>
                <th v-if="!product" class="px-3 py-2.5">Product</th>
                <th class="px-3 py-2.5 text-right">Change</th>
                <th class="px-3 py-2.5 text-right">Stock</th>
                <th class="px-3 py-2.5">Reason</th>
                <th class="px-3 py-2.5">By</th>
              </tr>
            </thead>

            <tbody>
              <tr
                v-for="move in visible"
                :key="move.id"
                class="border-t border-white/5 text-zinc-300"
              >
                <td class="whitespace-nowrap px-3 py-2 text-zinc-400">{{ formatDateTime(move.created_at) }}</td>
                <td v-if="!product" class="max-w-[16rem] truncate px-3 py-2 text-white" :title="move.product_name">
                  {{ move.product_name }}
                </td>
                <td
                  class="whitespace-nowrap px-3 py-2 text-right font-bold"
                  :class="Number(move.change) > 0 ? 'text-emerald-400' : 'text-red-400'"
                >
                  {{ formatChange(move.change) }}
                </td>
                <td class="whitespace-nowrap px-3 py-2 text-right text-zinc-400">
                  {{ count(move.old_quantity) }} → <span class="font-bold text-white">{{ count(move.new_quantity) }}</span>
                </td>
                <td class="whitespace-nowrap px-3 py-2">{{ move.reason }}</td>
                <td class="max-w-[10rem] truncate px-3 py-2" :title="move.changed_by_name">{{ move.changed_by_name || '—' }}</td>
              </tr>

              <tr v-if="shown.length === 0">
                <td :colspan="product ? 5 : 6" class="px-3 py-6 text-center text-zinc-500">No change matches "{{ search }}".</td>
              </tr>
            </tbody>
          </table>
        </div>

        <TablePager
          v-if="shown.length > 0"
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="shown.length"
          noun="changes"
          class="mt-3"
        />
      </div>
    </div>
  </Teleport>
</template>
