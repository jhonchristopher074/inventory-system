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
import NavIcon from './NavIcon.vue'
import { downloadStockHistory } from '../lib/stockHistoryExport'
import { readCurrentUser } from '../lib/currentUser'

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

function matches(move, words) {
  return `${move.product_name || ''} ${move.reason || ''} ${move.changed_by_name || ''} ${move.recorded_by_name || ''}`
    .toLowerCase()
    .includes(words)
}

const shown = computed(() => {
  const words = search.value.trim().toLowerCase()
  if (!words) return movements.value
  return movements.value.filter((move) => matches(move, words))
})

// ----- Export (audit trail): every change the search shows, not only this page -----
const exportOpen = ref(false)
const exporting = ref('')
const exportError = ref('')

async function exportAs(format) {
  if (exporting.value) return
  exportOpen.value = false
  exporting.value = format
  exportError.value = ''
  try {
    // the list here holds the latest 200: the file gets all of them
    const { data, error } = await supabase.rpc('list_stock_movements', {
      p_product_id: props.product ? props.product.id : null,
      p_limit: 5000,
    })
    if (error) throw error
    const words = search.value.trim().toLowerCase()
    const all = (data || []).filter((move) => !words || matches(move, words))
    if (all.length === 0) {
      exportError.value = 'Nothing to export.'
      return
    }
    const me = readCurrentUser()
    await downloadStockHistory({ movements: all, product: props.product, madeBy: me.full_name || me.email || '', format })
  } catch (err) {
    exportError.value = `Couldn't export: ${err.message || err}`
  } finally {
    exporting.value = ''
  }
}

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

          <div class="flex shrink-0 items-center gap-2">
            <button
              class="rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
              aria-label="Close"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>
        </div>

        <p v-if="exportError" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">{{ exportError }}</p>

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
                <td
                  class="max-w-[10rem] truncate px-3 py-2"
                  :title="move.recorded_by_name && move.recorded_by_name !== move.changed_by_name ? `Recorded as ${move.recorded_by_name}` : move.changed_by_name"
                >
                  {{ move.changed_by_name || '—' }}
                </td>
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
        >
          <!-- download for the audit trail: every change the search shows -->
          <template #actions>
            <div class="relative">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900 px-3 py-1.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
                :disabled="Boolean(exporting)"
                :aria-expanded="exportOpen"
                @click="exportOpen = !exportOpen"
              >
                <NavIcon name="download" class="h-4 w-4" />
                {{ exporting ? 'Exporting…' : 'Export' }}
              </button>
              <div
                v-if="exportOpen"
                class="absolute bottom-full right-0 z-10 mb-1.5 w-52 overflow-hidden rounded-xl border border-white/10 bg-zinc-800 shadow-2xl"
                role="menu"
              >
                <button type="button" role="menuitem" class="export-item" @click="exportAs('pdf')">
                  <b>PDF</b>
                  <span>Ready to print or send</span>
                </button>
                <button type="button" role="menuitem" class="export-item" @click="exportAs('xlsx')">
                  <b>Excel (.xlsx)</b>
                  <span>To sort and filter</span>
                </button>
              </div>
            </div>
          </template>
        </TablePager>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.export-item {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.1rem;
  padding: 0.6rem 0.85rem;
  text-align: left;
  font-size: 0.85rem;
  color: #fff;
}

.export-item span {
  font-size: 0.72rem;
  color: var(--color-zinc-400);
}

.export-item:hover,
.export-item:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.07);
}
</style>
