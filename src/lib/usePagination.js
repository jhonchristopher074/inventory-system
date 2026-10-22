import { computed, ref, watch } from 'vue'

// Rows per page the tables offer (the first one is the default).
export const PAGE_SIZES = [10, 15]

/**
 * Shows a list one page at a time, like a data table: 10 or 15 rows, with
 * Prev / Next and page numbers (see components/TablePager.vue).
 *
 *   const { page, pageSize, visible, reset } = usePagination(filteredItems, {
 *     storageKey: 'inventory', // remembers the rows-per-page choice
 *     scrollTarget: tableTop,  // ref of the table: back to its top on a new page
 *   })
 *
 * In the template: v-for over `visible`, and under the table
 *   <TablePager v-model:page="page" v-model:page-size="pageSize" :total="filteredItems.length" />
 * Call reset() when the search or filter changes, so it starts at page 1.
 */
export function usePagination(items, { storageKey = '', scrollTarget = null } = {}) {
  const page = ref(1)
  const pageSize = ref(savedSize(storageKey))

  const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / pageSize.value)))

  const visible = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return items.value.slice(start, start + pageSize.value)
  })

  // The list got shorter (e.g. the last product of the last page was
  // archived): stay on the last page that still has rows.
  watch(pageCount, (count) => {
    if (page.value > count) page.value = count
  })

  watch(pageSize, (size) => {
    page.value = 1
    if (!storageKey) return
    try {
      localStorage.setItem(`rowsPerPage:${storageKey}`, String(size))
    } catch {
      // private mode / storage blocked: the choice lasts until the page closes
    }
  })

  // Turning the page with the buttons under a long table would leave you at
  // the bottom of the new page, so bring the table's top back into view.
  if (scrollTarget) {
    watch(
      page,
      () => {
        const table = scrollTarget.value
        if (!table || table.getBoundingClientRect().top >= 0) return

        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        table.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' })
      },
      { flush: 'post' }
    )
  }

  function reset() {
    page.value = 1
  }

  return { page, pageSize, pageCount, visible, reset }
}

function savedSize(storageKey) {
  if (storageKey) {
    try {
      const saved = Number(localStorage.getItem(`rowsPerPage:${storageKey}`))
      if (PAGE_SIZES.includes(saved)) return saved
    } catch {
      // storage blocked: use the default
    }
  }

  return PAGE_SIZES[0]
}
