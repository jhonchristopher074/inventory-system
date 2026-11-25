<script setup>
// The orders to suppliers as a table (Inventory > Reorder > Orders sent, and
// Inventory > Orders): Open / All, a search, pages of 8, and each row opens
// a drop-down with the order's details (OrderDetails.vue).
//
//   <OrdersTable :orders="orders" :focus-id="id" @changed="reload" />
//   focus-id: open this order (and show its page), e.g. one just sent
import { computed, ref, watch } from 'vue'
import { ORDER_STATES, orderPieces } from '../lib/orders'
import { count, dayAndTime } from '../lib/format'
import NavIcon from './NavIcon.vue'
import OrderDetails from './OrderDetails.vue'

const props = defineProps({
  orders: { type: Array, default: () => [] },
  focusId: { type: [Number, String], default: null },
})
const emit = defineEmits(['changed'])

const PAGE = 8
const view = ref('open') // open | all
const search = ref('')
const page = ref(1)
const openId = ref(null)

const isOpenOrder = (order) => ['requested', 'accepted'].includes(order.order_status || 'requested')
const openCount = computed(() => props.orders.filter(isOpenOrder).length)

const filtered = computed(() => {
  const words = search.value.trim().toLowerCase().replace(/^#/, '')
  return props.orders.filter((order) => {
    if (view.value === 'open' && !isOpenOrder(order)) return false
    if (!words) return true
    const text = [order.id, order.supplier_name, order.created_by_name, ...(order.items || []).map((item) => item.product_name)]
      .join(' ')
      .toLowerCase()
    return text.includes(words)
  })
})

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE)))
const rows = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE))
const from = computed(() => (filtered.value.length ? (page.value - 1) * PAGE + 1 : 0))
const to = computed(() => Math.min(page.value * PAGE, filtered.value.length))

watch([view, search], () => (page.value = 1))
watch(pages, (n) => {
  if (page.value > n) page.value = n
})

// open the order asked for, on its page
watch(
  () => [props.focusId, props.orders.length],
  ([id]) => {
    if (id == null) return
    const order = props.orders.find((o) => String(o.id) === String(id))
    if (!order) return
    if (!isOpenOrder(order)) view.value = 'all'
    search.value = ''
    const at = filtered.value.findIndex((o) => o.id === order.id)
    if (at >= 0) page.value = Math.floor(at / PAGE) + 1
    openId.value = order.id
  },
  { immediate: true }
)

function toggle(id) {
  openId.value = openId.value === id ? null : id
}

const stateOf = (order) => ORDER_STATES[order.order_status || 'requested'] || ORDER_STATES.requested

function emailOf(order) {
  if (order.status === 'sent') return { icon: 'check', tone: 'text-emerald-400', label: 'Emailed' }
  if (order.status === 'failed') return { icon: 'alert', tone: 'text-red-400', label: 'Not emailed' }
  return { icon: 'mail', tone: 'text-zinc-500', label: 'Not emailed yet' }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Open / All and the search -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex gap-1.5" role="group" aria-label="Show orders">
        <button
          v-for="option in [{ key: 'open', label: `Open · ${openCount}` }, { key: 'all', label: `All · ${orders.length}` }]"
          :key="option.key"
          type="button"
          class="rounded-xl px-3.5 py-1.5 text-sm font-bold"
          :class="view === option.key ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'"
          :aria-pressed="view === option.key"
          @click="view = option.key"
        >
          {{ option.label }}
        </button>
      </div>
      <label class="sr-only" for="orders-search">Search orders</label>
      <input
        id="orders-search"
        v-model="search"
        type="search"
        placeholder="Search order #, supplier or product"
        class="min-w-0 flex-1 basis-48 rounded-xl border border-white/10 bg-zinc-950 px-3 py-1.5 text-sm text-white"
      />
    </div>

    <div class="overflow-hidden rounded-2xl border border-white/10">
      <table class="w-full text-sm">
        <thead class="bg-white/[0.03] text-left text-[0.66rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
          <tr>
            <th class="px-4 py-2.5">Order</th>
            <th class="hidden px-3 py-2.5 sm:table-cell">Supplier</th>
            <th class="hidden px-3 py-2.5 text-right md:table-cell">Items</th>
            <th class="px-3 py-2.5">Status</th>
            <th class="hidden px-2 py-2.5 text-center sm:table-cell">Email</th>
            <th class="w-10 px-3 py-2.5"><span class="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="px-4 py-10 text-center text-sm text-zinc-500">
              {{ search ? 'No order matches the search.' : view === 'open' ? 'No open orders.' : 'No orders yet.' }}
            </td>
          </tr>
          <template v-for="order in rows" :key="order.id">
            <tr
              class="order-row cursor-pointer border-t border-white/5"
              :class="openId === order.id ? 'is-open' : ''"
              @click="toggle(order.id)"
            >
              <td class="px-4 py-2.5">
                <p class="font-extrabold text-white">#{{ order.id }}</p>
                <p class="text-xs text-zinc-500">{{ dayAndTime(order.created_at) }}</p>
                <p class="truncate text-xs text-zinc-400 sm:hidden">{{ order.supplier_name }}</p>
              </td>
              <td class="hidden px-3 py-2.5 sm:table-cell">
                <p class="max-w-[14rem] truncate text-zinc-200">{{ order.supplier_name }}</p>
              </td>
              <td class="hidden px-3 py-2.5 text-right md:table-cell">
                <p class="font-bold text-white">{{ count(orderPieces(order)) }} pcs</p>
                <p class="text-xs text-zinc-500">
                  {{ count((order.items || []).length) }} {{ (order.items || []).length === 1 ? 'product' : 'products' }}
                </p>
              </td>
              <td class="px-3 py-2.5">
                <span class="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.7rem] font-bold" :class="stateOf(order).tone">
                  {{ stateOf(order).short }}
                </span>
              </td>
              <td class="hidden px-2 py-2.5 text-center sm:table-cell">
                <span :title="emailOf(order).label" class="inline-flex" :class="emailOf(order).tone">
                  <NavIcon :name="emailOf(order).icon" class="h-4 w-4" />
                  <span class="sr-only">{{ emailOf(order).label }}</span>
                </span>
              </td>
              <td class="px-3 py-2.5 text-right">
                <button
                  type="button"
                  class="grid h-7 w-7 place-items-center rounded-full bg-white/5 text-zinc-300 hover:bg-white/10"
                  :aria-expanded="openId === order.id"
                  :aria-controls="`order-details-${order.id}`"
                  :aria-label="`${openId === order.id ? 'Close' : 'Open'} order #${order.id}`"
                  @click.stop="toggle(order.id)"
                >
                  <NavIcon name="chevron" class="chev h-4 w-4" />
                </button>
              </td>
            </tr>
            <!-- the drop-down -->
            <tr v-if="openId === order.id" :id="`order-details-${order.id}`" class="details-row">
              <td colspan="6" class="px-4 pb-4 pt-3">
                <OrderDetails :order="order" @changed="emit('changed', $event)" />
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- pages -->
    <div v-if="filtered.length > PAGE" class="flex items-center justify-between gap-2 text-xs text-zinc-500">
      <span>Showing {{ from }}–{{ to }} of {{ filtered.length }}</span>
      <div class="flex items-center gap-1.5">
        <button type="button" class="page-btn" :disabled="page <= 1" @click="page--">‹ Prev</button>
        <span class="px-1 font-bold text-zinc-300">{{ page }} / {{ pages }}</span>
        <button type="button" class="page-btn" :disabled="page >= pages" @click="page++">Next ›</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.order-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

.order-row.is-open,
.details-row {
  background: rgba(255, 255, 255, 0.04);
}

/* chevron: down when closed, up when open */
.chev {
  transform: rotate(90deg);
  transition: transform 0.2s;
}

.is-open .chev {
  transform: rotate(-90deg);
}

.page-btn {
  border-radius: 0.6rem;
  background: var(--color-zinc-800);
  padding: 0.35rem 0.7rem;
  font-weight: 700;
  color: var(--color-zinc-200);
}

.page-btn:hover:not(:disabled) {
  background: var(--color-zinc-700);
}

.page-btn:disabled {
  opacity: 0.4;
}
</style>
