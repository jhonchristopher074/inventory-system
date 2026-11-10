<script setup>
// Footer of a data table: "Showing 11–20 of 57 products", the rows per
// page (10 / 15 / All) and the page buttons. A table with a search line
// puts the rows menu on that line instead: rows-to="#its-spot" (an empty
// <span id="its-spot" class="contents"> there). Goes with lib/usePagination.js:
//
//   <TablePager v-model:page="page" v-model:page-size="pageSize" :total="items.length" noun="products" />
//
// Under a card grid (POS, Documentation) it's a card of its own:
//   <TablePager ... :sizes="GRID_PAGE_SIZES" label="Per page" card />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ALL, PAGE_SIZES, rowsPerPage } from '../lib/usePagination'
import { count } from '../lib/format'

// two parts (the bar above the table, this footer): the page's class and
// attributes go on the footer
defineOptions({ inheritAttrs: false })

const props = defineProps({
  total: { type: Number, required: true },
  noun: { type: String, default: 'items' },
  // the choices of the menu (ALL = every row on one page)
  sizes: { type: Array, default: () => PAGE_SIZES },
  // the menu's name: "Rows" in a table, "Per page" under cards
  label: { type: String, default: 'Rows' },
  // a card of its own (under a card grid) instead of the foot of a table card
  card: { type: Boolean, default: false },
  // where the rows menu goes, e.g. '#sales-rows' (on the search line)
  rowsTo: { type: String, default: '' },
})

const page = defineModel('page', { type: Number, default: 1 })
const pageSize = defineModel('pageSize', { type: Number, default: PAGE_SIZES[0] })

const perPage = computed(() => rowsPerPage(pageSize.value, props.total))
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / perPage.value)))
const first = computed(() => (props.total === 0 ? 0 : (page.value - 1) * perPage.value + 1))
const last = computed(() => Math.min(page.value * perPage.value, props.total))

// 1 … 4 5 6 … 12: the first and last page, and the ones next to this one
const pageButtons = computed(() => {
  const buttons = []

  for (let n = 1; n <= pageCount.value; n++) {
    if (n === 1 || n === pageCount.value || Math.abs(n - page.value) <= 1) buttons.push(n)
    else if (buttons[buttons.length - 1] !== '…') buttons.push('…')
  }

  return buttons
})

function goTo(n) {
  page.value = Math.min(Math.max(n, 1), pageCount.value)
}

// The rows menu on the table's search line (rows-to), found in the page
// this pager is in (the page may not be on screen yet when it's made)
const root = ref(null)
const topBar = ref(null)

onMounted(() => {
  if (!props.rowsTo || !root.value) return
  let top = root.value
  while (top.parentElement) top = top.parentElement
  topBar.value = top.querySelector(props.rowsTo) || document.querySelector(props.rowsTo)
})

onBeforeUnmount(() => {
  topBar.value = null
})
</script>

<template>
  <!-- rows per page, on the table's search line (rows-to) -->
  <Teleport v-if="topBar" :to="topBar">
    <select
      v-model.number="pageSize"
      class="rows-menu"
      :aria-label="`${noun} per page`"
      :title="`${noun} per page`"
    >
      <option v-for="size in sizes" :key="size" :value="size">
        {{ size === ALL ? 'All rows' : `${size} rows` }}
      </option>
    </select>
  </Teleport>

  <div ref="root" v-bind="$attrs" class="table-pager" :class="{ 'table-pager--card': card }">
    <p class="text-sm text-zinc-400">
      <template v-if="pageSize === ALL">
        Showing all <b class="text-white">{{ count(total) }}</b> {{ noun }}
      </template>
      <template v-else>
        Showing
        <b class="text-white">{{ count(first) }}–{{ count(last) }}</b>
        of <b class="text-white">{{ count(total) }}</b> {{ noun }}
      </template>
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <!-- e.g. Stock History's Export -->
      <slot name="actions" />

      <!-- (no search line: the menu stays here) -->
      <label v-if="!topBar" class="flex items-center gap-2 text-sm text-zinc-400">
        {{ label }}
        <select
          v-model.number="pageSize"
          class="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-red-500"
        >
          <option v-for="size in sizes" :key="size" :value="size">
            {{ size === ALL ? 'All' : size }}
          </option>
        </select>
      </label>

      <!-- always there, even when everything fits on one page (e.g. "All"):
           Prev / Next are then greyed out, so every table looks the same -->
      <nav class="flex items-center gap-1" aria-label="Pages">
        <button
          type="button"
          class="pager-btn"
          :disabled="page <= 1"
          @click="goTo(page - 1)"
        >
          ‹ Prev
        </button>

        <!-- phones: "2 / 6" instead of every number -->
        <span class="phone-only px-2 text-sm font-bold text-white">{{ page }} / {{ pageCount }}</span>

        <template v-for="(n, i) in pageButtons" :key="`${n}-${i}`">
          <span v-if="n === '…'" class="desktop-only px-1 text-zinc-500">…</span>
          <button
            v-else
            type="button"
            class="pager-btn desktop-only"
            :class="{ 'pager-btn--current': n === page }"
            :aria-current="n === page ? 'page' : undefined"
            @click="goTo(n)"
          >
            {{ n }}
          </button>
        </template>

        <button
          type="button"
          class="pager-btn"
          :disabled="page >= pageCount"
          @click="goTo(page + 1)"
        >
          Next ›
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.table-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1.25rem;
  border-top: 1px solid var(--hairline);
  padding: 0.8rem 1.1rem;
}

/* under a card grid: a card of its own, like the cards above it */
.table-pager--card {
  border: 1px solid var(--hairline);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.rows-menu {
  flex: none;
  align-self: stretch;
  cursor: pointer;
  border-radius: 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--color-zinc-900);
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #fff;
  outline: none;
}

.rows-menu:focus {
  border-color: rgba(224, 27, 50, 0.55);
}

.pager-btn {
  min-width: 2.25rem;
  border-radius: 0.6rem;
  border: 1px solid var(--hairline);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.4rem 0.7rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #d2d2db;
}

.pager-btn:hover:not(:disabled) {
  border-color: rgba(224, 27, 50, 0.45);
  color: #fff;
}

.pager-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.pager-btn--current {
  border-color: var(--brand);
  background: var(--brand);
  color: #fff;
}
</style>
