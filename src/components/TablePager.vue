<script setup>
// Footer of a data table: "Showing 11–20 of 57 products", rows per page
// (10 / 15) and the page buttons. Goes with lib/usePagination.js:
//
//   <TablePager v-model:page="page" v-model:page-size="pageSize" :total="items.length" noun="products" />
import { computed } from 'vue'
import { PAGE_SIZES } from '../lib/usePagination'
import { count } from '../lib/format'

const props = defineProps({
  total: { type: Number, required: true },
  noun: { type: String, default: 'items' },
})

const page = defineModel('page', { type: Number, default: 1 })
const pageSize = defineModel('pageSize', { type: Number, default: PAGE_SIZES[0] })

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / pageSize.value)))
const first = computed(() => (props.total === 0 ? 0 : (page.value - 1) * pageSize.value + 1))
const last = computed(() => Math.min(page.value * pageSize.value, props.total))

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
</script>

<template>
  <div class="table-pager">
    <p class="text-sm text-zinc-400">
      Showing
      <b class="text-white">{{ count(first) }}–{{ count(last) }}</b>
      of <b class="text-white">{{ count(total) }}</b> {{ noun }}
    </p>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm text-zinc-400">
        Rows
        <select
          v-model.number="pageSize"
          class="rounded-lg border border-white/10 bg-zinc-900 px-2 py-1.5 text-sm font-bold text-white outline-none focus:border-red-500"
        >
          <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

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
