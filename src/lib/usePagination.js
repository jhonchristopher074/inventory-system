import { computed, ref, watch } from 'vue'

// "All" in the rows-per-page menu: every row on one page.
export const ALL = 0

// Rows per page the data tables offer (the first one is the default).
export const PAGE_SIZES = [10, 15, ALL]

// Cards per page of the card grids (POS, Documentation). They show 4 cards a
// row, so 16 is 4 full rows and 24 is 6.
export const GRID_PAGE_SIZES = [16, 24, ALL]

/**
 * Shows a list one page at a time, like a data table: 10, 15 or all rows,
 * with Prev / Next and page numbers (see components/TablePager.vue).
 *
 *   const { page, pageSize, visible, reset } = usePagination(filteredItems, {
 *     storageKey: 'inventory', // remembers the rows-per-page choice
 *     scrollTarget: tableTop,  // ref of the table: back to its top on a new page
 *     sizes: GRID_PAGE_SIZES,  // optional: the menu's choices (PAGE_SIZES if left out)
 *   })
 *
 * In the template: v-for over `visible`, and under the table
 *   <TablePager v-model:page="page" v-model:page-size="pageSize" :total="filteredItems.length" />
 * (a card grid also gives the pager :sizes="GRID_PAGE_SIZES").
 * Call reset() when the search or filter changes, so it starts at page 1.
 */
export function usePagination(items, { storageKey = '', scrollTarget = null, sizes = PAGE_SIZES } = {}) {
  const page = ref(1)
  const pageSize = ref(savedSize(storageKey, sizes))

  const perPage = computed(() => rowsPerPage(pageSize.value, items.value.length))

  const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / perPage.value)))

  const visible = computed(() => {
    const start = (page.value - 1) * perPage.value
    return items.value.slice(start, start + perPage.value)
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

// Rows on one page. "All" is the whole list (at least 1, so an empty list
// still has its one, empty, page).
export function rowsPerPage(size, total) {
  return size === ALL ? Math.max(total, 1) : size
}

function savedSize(storageKey, sizes) {
  if (storageKey) {
    try {
      const saved = localStorage.getItem(`rowsPerPage:${storageKey}`)
      // only a saved number: nothing saved (null) would read as 0, "All"
      if (/^\d+$/.test(saved || '') && sizes.includes(Number(saved))) return Number(saved)
    } catch {
      // storage blocked: use the default
    }
  }

  return sizes[0]
}
