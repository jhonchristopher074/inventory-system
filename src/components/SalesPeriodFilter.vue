<script setup>
// Date filter for the Sales History pages (admin and cashier):
// All / Today / Last 7 days / This month / Custom dates (up to 1 year).
//
//   <SalesPeriodFilter v-model="range" />
//   range = { start: Date | null, end: Date | null }   (end is exclusive)
// Dates are by this computer's clock. Picking the dates opens the phone's
// or browser's own calendar.
import { computed, ref, watch } from 'vue'

const range = defineModel({ type: Object, default: () => ({ start: null, end: null }) })

const PERIODS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom dates' },
]

const MAX_DAYS = 366 // custom range: one year at most

const period = ref('all')

// 'YYYY-MM-DD' of a local date (what <input type="date"> uses)
function ymd(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

function parseYmd(text) {
  const [y, m, d] = String(text || '').split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d) : null
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const today = ymd(new Date())
const from = ref(ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
const to = ref(today)

// what each date box may be set to: never in the future, never more than a year apart
const fromMin = computed(() => (to.value ? ymd(addDays(parseYmd(to.value), -(MAX_DAYS - 1))) : ''))
const fromMax = computed(() => to.value || today)
const toMin = computed(() => from.value || '')
const toMax = computed(() => {
  if (!from.value) return today
  const limit = ymd(addDays(parseYmd(from.value), MAX_DAYS - 1))
  return limit < today ? limit : today
})

const rangeError = computed(() => {
  if (period.value !== 'custom') return ''
  const start = parseYmd(from.value)
  const end = parseYmd(to.value)
  if (!start || !end) return 'Pick both dates.'
  if (start > end) return '"From" must be on or before "To".'
  if ((end - start) / 86400000 + 1 > MAX_DAYS) return 'Pick at most one year.'
  return ''
})

function computeRange() {
  const now = new Date()
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (period.value === 'today') return { start: midnight, end: null }
  if (period.value === 'week') return { start: addDays(midnight, -6), end: null }
  if (period.value === 'month') return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null }
  if (period.value === 'custom' && !rangeError.value) {
    return { start: parseYmd(from.value), end: addDays(parseYmd(to.value), 1) }
  }
  return { start: null, end: null }
}

watch([period, from, to], () => {
  // a wrong custom range keeps showing the last good one
  if (period.value === 'custom' && rangeError.value) return
  range.value = computeRange()
}, { immediate: true })
</script>

<template>
  <div class="mb-4">
    <div class="flex flex-wrap items-center gap-2">
    <!-- one row you can swipe on phones -->
    <div class="-mx-1 flex min-w-0 max-w-full gap-2 overflow-x-auto px-1 pb-1">
      <button
        v-for="option in PERIODS"
        :key="option.key"
        class="shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition"
        :class="period === option.key
          ? 'bg-red-600 text-white'
          : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white'"
        @click="period = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- e.g. the admin's cashier search: right end of the same row
         (its own line on phones) -->
    <div v-if="$slots.end" class="w-full pb-1 sm:ml-auto sm:w-64">
      <slot name="end" />
    </div>
    </div>

    <div
      v-if="period === 'custom'"
      class="mt-3 flex flex-wrap items-end gap-3 rounded-[20px] border border-white/10 bg-zinc-900 p-4"
    >
      <label class="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-bold text-zinc-400 sm:flex-none">
        From
        <input
          v-model="from"
          type="date"
          :min="fromMin"
          :max="fromMax"
          class="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white [color-scheme:dark] focus:border-red-500 focus:outline-none"
        />
      </label>

      <label class="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-bold text-zinc-400 sm:flex-none">
        To
        <input
          v-model="to"
          type="date"
          :min="toMin"
          :max="toMax"
          class="rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white [color-scheme:dark] focus:border-red-500 focus:outline-none"
        />
      </label>

      <p class="basis-full text-xs" :class="rangeError ? 'text-red-400' : 'text-zinc-500'">
        {{ rangeError || 'Up to one year at a time.' }}
      </p>
    </div>
  </div>
</template>
