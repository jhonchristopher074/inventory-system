<script setup>
// Stock history (admin): every change to stock, recorded by the database,
// including changes made by the receipt scanner (n8n).
// With a product: that product's history. Without: recent changes to all.
// Short rows, a search, and 10 / 15 / all a page, so it never runs long.
import { computed, onMounted, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { count } from '../lib/format'
import { ALL, usePagination } from '../lib/usePagination'
import TablePager from './TablePager.vue'
import NavIcon from './NavIcon.vue'
import { downloadStockHistory } from '../lib/stockHistoryExport'
import { readCurrentUser } from '../lib/currentUser'
import DatePicker from './DatePicker.vue'

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
const FORMATS = [
  { key: 'pdf', label: 'PDF', hint: 'Print or send' },
  { key: 'xlsx', label: 'Excel', hint: 'Sort and filter' },
]
const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Pick dates' },
]
const exportFormat = ref('pdf')
const exportPeriod = ref('all')
const customFrom = ref('')
const customTo = ref('')

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function todayYmd() {
  return ymd(new Date())
}
function shortDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// { from, to, label, missing } for the period picked ('' = no limit)
const periodRange = computed(() => {
  const today = todayYmd()
  const now = new Date()
  switch (exportPeriod.value) {
    case 'today':
      return { from: today, to: today, label: `Today, ${shortDay(today)}` }
    case 'week': {
      const from = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
      return { from, to: today, label: `${shortDay(from)} - ${shortDay(today)}` }
    }
    case 'month': {
      const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1))
      return { from, to: today, label: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }
    }
    case 'custom':
      if (!customFrom.value || !customTo.value) return { from: '', to: '', label: '', missing: true }
      return { from: customFrom.value, to: customTo.value, label: `${shortDay(customFrom.value)} - ${shortDay(customTo.value)}` }
    default:
      return { from: '', to: '', label: 'All time' }
  }
})

function inPeriod(move) {
  const { from, to } = periodRange.value
  if (!from && !to) return true
  const day = ymd(new Date(move.created_at))
  return (!from || day >= from) && (!to || day <= to)
}

// how many go in the file (from the list loaded here; null when it may
// hold only part of the history: the file still gets all of them)
const previewCount = computed(() => {
  if (periodRange.value.missing) return null
  if (movements.value.length >= 200) return null
  const words = search.value.trim().toLowerCase()
  return movements.value.filter((move) => inPeriod(move) && (!words || matches(move, words))).length
})

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
    const all = (data || []).filter((move) => inPeriod(move) && (!words || matches(move, words)))
    if (all.length === 0) {
      exportError.value = 'No stock change in that period.'
      return
    }
    const me = readCurrentUser()
    const range = periodRange.value
    await downloadStockHistory({
      movements: all,
      product: props.product,
      madeBy: me.full_name || me.email || '',
      format,
      period: range.from || range.to ? range : null,
    })
  } catch (err) {
    exportError.value = `Couldn't export: ${err.message || err}`
  } finally {
    exporting.value = ''
  }
}

const tableTop = ref(null)
const { page, pageSize, visible, reset } = usePagination(shown, { storageKey: 'stockHistory', scrollTarget: tableTop })

// The last page has fewer rows: keep the window as tall as a full page, so
// it doesn't shrink and move the page buttons. Measured on a full page.
const fullPageHeight = ref(0)
watch(pageSize, () => {
  fullPageHeight.value = 0
})
watch(
  visible,
  () => {
    const el = tableTop.value
    if (!el || pageSize.value === ALL || visible.value.length < pageSize.value) return
    el.style.minHeight = ''
    fullPageHeight.value = Math.max(fullPageHeight.value, el.offsetHeight)
  },
  { flush: 'post' }
)
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
      <div class="flex max-h-[90vh] w-full min-w-0 max-w-5xl flex-col rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:p-6">
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

        <div class="mb-3 flex gap-2">
        <input
          v-if="movements.length > 10"
          v-model="search"
          type="search"
          maxlength="80"
          :placeholder="product ? 'Search reason or person…' : 'Search product, reason or person…'"
          aria-label="Search the stock history"
          class="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-4 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500"
        />
        <span v-else class="flex-1"></span>
        <span id="stock-history-rows" class="contents"></span>
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

        <!-- keeps a full page's height on a shorter (last) page; the scrollbar's room is
             always kept, so the columns don't move between pages -->
        <div
          v-if="movements.length > 0"
          ref="tableTop"
          class="min-h-0 overflow-auto rounded-2xl border border-white/10 [scrollbar-gutter:stable]"
          :style="fullPageHeight ? { minHeight: `${fullPageHeight}px` } : null"
        >
          <!-- fixed columns: the same widths on every page -->
          <table class="w-full table-fixed text-left text-sm" :class="product ? 'min-w-[40rem]' : 'min-w-[56rem]'">
            <colgroup>
              <col class="w-[9.5rem]" />
              <col v-if="!product" />
              <col class="w-[5rem]" />
              <col class="w-[7.5rem]" />
              <col :class="product ? '' : 'w-[14rem]'" />
              <col class="w-[9rem]" />
            </colgroup>
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
                <td v-if="!product" class="truncate px-3 py-2 text-white" :title="move.product_name">
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
                <td class="truncate px-3 py-2" :title="move.reason">{{ move.reason }}</td>
                <td
                  class="truncate px-3 py-2"
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
          rows-to="#stock-history-rows"
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
              <!-- 1. PDF or Excel · 2. which days · Download -->
              <div
                v-if="exportOpen"
                class="export-panel"
                role="dialog"
                aria-label="Export the stock history"
              >
                <p class="export-step">1. Format</p>
                <div class="export-seg" role="group" aria-label="Format">
                  <button
                    v-for="option in FORMATS"
                    :key="option.key"
                    type="button"
                    :class="{ 'is-on': exportFormat === option.key }"
                    :aria-pressed="exportFormat === option.key"
                    @click="exportFormat = option.key"
                  >
                    <b>{{ option.label }}</b>
                    <span>{{ option.hint }}</span>
                  </button>
                </div>

                <p class="export-step">2. Period</p>
                <div class="export-periods" role="group" aria-label="Period">
                  <button
                    v-for="option in PERIODS"
                    :key="option.key"
                    type="button"
                    :class="{ 'is-on': exportPeriod === option.key }"
                    :aria-pressed="exportPeriod === option.key"
                    @click="exportPeriod = option.key"
                  >
                    {{ option.label }}
                  </button>
                </div>

                <div v-if="exportPeriod === 'custom'" class="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <p class="mb-1 text-[0.7rem] font-bold text-zinc-400">From</p>
                    <DatePicker v-model="customFrom" :max="customTo || todayYmd()" size="compact" placeholder="Start" />
                  </div>
                  <div>
                    <p class="mb-1 text-[0.7rem] font-bold text-zinc-400">To</p>
                    <DatePicker v-model="customTo" :min="customFrom" :max="todayYmd()" size="compact" placeholder="End" />
                  </div>
                </div>

                <p class="mt-3 text-xs text-zinc-400">
                  <template v-if="periodRange.missing">Pick both dates.</template>
                  <template v-else>
                    <b class="text-white">{{ periodRange.label }}</b>
                    <template v-if="previewCount !== null"> · {{ previewCount }} {{ previewCount === 1 ? 'change' : 'changes' }}</template>
                    <template v-if="search.trim()"> matching "{{ search.trim() }}"</template>
                  </template>
                </p>

                <div class="mt-3 flex gap-2">
                  <button type="button" class="flex-1 rounded-lg bg-zinc-700/60 py-2 text-sm font-bold text-white hover:bg-zinc-700" @click="exportOpen = false">
                    Cancel
                  </button>
                  <button
                    type="button"
                    class="inline-flex flex-[2] items-center justify-center gap-1.5 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
                    :disabled="periodRange.missing || previewCount === 0"
                    @click="exportAs(exportFormat)"
                  >
                    <NavIcon name="download" class="h-4 w-4" />
                    Download {{ exportFormat === 'pdf' ? 'PDF' : 'Excel' }}
                  </button>
                </div>
              </div>
            </div>
          </template>
        </TablePager>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.export-panel {
  position: absolute;
  right: 0;
  bottom: 100%;
  z-index: 10;
  margin-bottom: 0.5rem;
  width: min(21rem, 86vw);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: var(--surface-raised);
  box-shadow: 0 18px 40px -12px rgba(0, 0, 0, 0.75);
  padding: 0.9rem;
}

.export-step {
  margin: 0.15rem 0 0.4rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-zinc-500);
}

.export-step + .export-seg,
.export-step + .export-periods {
  margin-bottom: 0.75rem;
}

.export-seg {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.export-seg button {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  border-radius: 0.7rem;
  border: 1px solid var(--hairline);
  padding: 0.55rem 0.7rem;
  text-align: left;
  font-size: 0.85rem;
  color: #fff;
}

.export-seg button span {
  font-size: 0.7rem;
  color: var(--color-zinc-400);
}

.export-periods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.export-periods button {
  border-radius: 999px;
  border: 1px solid var(--hairline);
  padding: 0.3rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.export-seg button:hover,
.export-periods button:hover {
  background: rgba(255, 255, 255, 0.05);
}

.export-seg button.is-on,
.export-periods button.is-on {
  border-color: rgba(244, 52, 76, 0.7);
  background: rgba(224, 27, 50, 0.14);
  color: #fff;
}
</style>
