<script setup>
// The inspection calendar as a data table (admin and staff Calendar pages):
// one row per scheduled product with its progress and status, 10 or 15 a
// page, oldest date first. The row's button opens that page's own window
// (admin: who submitted / saved what; staff: the inspection form).
//
// Each row is worked out by the page, which has the numbers:
//   {
//     item,          // the product (sent back with "open")
//     date,          // inspection date, 'YYYY-MM-DD'
//     qty,           // batch size
//     approved,      // approved by the admin so far (good + returned)
//     approvedPct, savedPct, submittedPct, totalPct,  // the progress bar
//     remaining,     // not inspected yet
//     started,       // anything approved, saved or submitted
//     overdue,       // date passed, not finished
//     waiting,       // submitted inspections waiting for the admin
//     mine,          // (staff) has their own saved inspection
//   }
import { computed, ref, watch } from 'vue'
import { usePagination } from '../lib/usePagination'
import TablePager from './TablePager.vue'
import { count } from '../lib/format'

const props = defineProps({
  rows: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  actionLabel: { type: String, default: 'Details' },
  // remembers the rows-per-page choice of this table
  storageKey: { type: String, default: 'inspections' },
})

const emit = defineEmits(['open'])

const search = ref('')

const shownRows = computed(() => {
  const text = search.value.trim().toLowerCase()

  return props.rows
    .filter(
      (row) =>
        !text ||
        String(row.item.name || '').toLowerCase().includes(text) ||
        String(row.item.category || '').toLowerCase().includes(text)
    )
    .sort(
      (a, b) =>
        String(a.date).localeCompare(String(b.date)) ||
        String(a.item.name || '').localeCompare(String(b.item.name || ''))
    )
})

const tableTop = ref(null)

const { page, pageSize, visible, reset } = usePagination(shownRows, {
  storageKey: props.storageKey,
  scrollTarget: tableTop,
})

watch(search, reset)

// one main status per row
function status(row) {
  if (row.qty > 0 && row.approved >= row.qty) return { label: 'Done', tone: 'bg-emerald-600/20 text-emerald-400' }
  if (row.overdue) return { label: 'Overdue', tone: 'bg-red-600/20 text-red-400' }
  if (!row.started) return { label: 'Not started', tone: 'bg-zinc-700/60 text-zinc-300' }
  return { label: 'In progress', tone: 'bg-sky-500/15 text-sky-300' }
}

function formatDate(date) {
  if (!date) return 'No date'

  // "2026-10-13" is a local date, not UTC midnight (that can show the day before)
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number)

  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
</script>

<template>
  <div>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <!-- what the colours of the progress bar mean -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-full bg-red-600" aria-hidden="true"></span>Approved
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-full bg-lime-400" aria-hidden="true"></span>Saved
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block h-2 w-2 rounded-full bg-yellow-400" aria-hidden="true"></span>Submitted
        </span>
      </div>

      <input
        v-model="search"
        type="search"
        placeholder="Search product..."
        aria-label="Search product"
        class="w-full rounded-full border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-red-500 sm:w-64"
      />
    </div>

    <div ref="tableTop" class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="data-table resp-table inspection-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th class="num">Batch</th>
              <th>Progress</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            <tr
              v-for="row in visible"
              :key="row.item.id"
              :class="{ 'bg-red-950/25': row.overdue }"
            >
              <td data-label="Date" class="whitespace-nowrap text-sm font-bold" :class="row.overdue ? 'text-red-400' : 'text-white'">
                {{ formatDate(row.date) }}
              </td>

              <td class="cell-main">
                <div class="min-w-0">
                  <p class="font-bold text-white">{{ row.item.name }}</p>
                  <p class="text-xs text-red-400">{{ row.item.category || 'Uncategorized' }}</p>
                </div>
              </td>

              <td data-label="Batch" class="num text-sm font-bold text-white">{{ count(row.qty) }}</td>

              <td data-label="Progress">
                <div class="w-40">
                  <div class="flex items-baseline justify-between gap-2 text-xs">
                    <span class="font-bold text-white">{{ row.totalPct }}%</span>
                    <span class="text-zinc-400">{{ count(row.remaining) }} left</span>
                  </div>

                  <div
                    class="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-zinc-800"
                    role="img"
                    :aria-label="`${row.totalPct}% inspected, ${row.remaining} left`"
                  >
                    <div class="h-full bg-red-600" :style="{ width: row.approvedPct + '%' }"></div>
                    <div class="h-full bg-lime-400" :style="{ width: row.savedPct + '%' }"></div>
                    <div class="h-full bg-yellow-400" :style="{ width: row.submittedPct + '%' }"></div>
                  </div>
                </div>
              </td>

              <td data-label="Status">
                <div class="flex flex-wrap gap-1.5">
                  <span class="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" :class="status(row).tone">
                    {{ status(row).label }}
                  </span>
                  <span
                    v-if="row.waiting > 0"
                    class="whitespace-nowrap rounded-full bg-yellow-500/15 px-2.5 py-0.5 text-xs font-bold text-yellow-400"
                  >
                    {{ row.waiting }} waiting approval
                  </span>
                  <span
                    v-if="row.mine"
                    class="whitespace-nowrap rounded-full bg-lime-500/15 px-2.5 py-0.5 text-xs font-bold text-lime-400"
                  >
                    Your draft saved
                  </span>
                </div>
              </td>

              <td class="cell-actions">
                <div class="row-actions">
                  <button
                    class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                    @click="emit('open', row.item)"
                  >
                    {{ actionLabel }}
                  </button>
                </div>
              </td>
            </tr>

            <tr v-if="shownRows.length === 0">
              <td colspan="6" class="cell-main p-6 text-center text-zinc-500">
                {{
                  loading
                    ? 'Loading...'
                    : rows.length === 0
                      ? 'No inspection schedules.'
                      : 'No product matches your search.'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <TablePager
        v-if="shownRows.length > 0"
        v-model:page="page"
        v-model:page-size="pageSize"
        :total="shownRows.length"
        noun="inspections"
      />
    </div>
  </div>
</template>

<style scoped>
/* phones: each row is a card that starts with the product's name */
@media (max-width: 760px) {
  .inspection-table tbody tr {
    display: flex;
    flex-direction: column;
  }

  .inspection-table td.cell-main {
    order: -1;
  }
}
</style>
