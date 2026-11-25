<script setup>
// Reorder (Inventory > Low stock): the products running low, by supplier,
// with how many to order (lib/reorder.js: enough for the last 30 days'
// sales, and at least 20 in stock after; the owner can change it). "Send
// order request" sends it to that supplier (lib/orders.js): it shows in
// their Drop Box > Orders and is emailed to them.
//
//   <ReorderListModal :fallback="lowProducts" @close="..." @sent="..." />
// fallback: the low products Inventory already has, used when the
// database can't say who supplies them (no admin_reorder_candidates).
import { computed, onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { listSales } from '../lib/salesQuery'
import { LOW_STOCK } from '../lib/stock'
import { MIN_AFTER_ORDER, bySupplier, soldByProduct } from '../lib/reorder'
import { listOrders, sendOrder } from '../lib/orders'
import { count, dayAndTime } from '../lib/format'
import HelpTip from './HelpTip.vue'
import NavIcon from './NavIcon.vue'
import OrderCard from './OrderCard.vue'

const props = defineProps({
  fallback: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'sent'])

const groups = ref([])
const suppliers = ref([]) // every active supplier: [{ id, name, email }]
const loading = ref(true)
const errorMessage = ref('')

const productCount = computed(() => groups.value.reduce((n, group) => n + group.items.length, 0))

// the orders already sent, under the products (OrderCard.vue)
const orders = ref([])
const showAllOrders = ref(false)
const openOrderId = ref(null)
const isOpenOrder = (order) => ['requested', 'accepted'].includes(order.order_status || 'requested')
const openOrders = computed(() => orders.value.filter(isOpenOrder))
const shownOrders = computed(() => (showAllOrders.value ? orders.value : openOrders.value))

async function loadOrders() {
  try {
    orders.value = (await listOrders()).list
  } catch (err) {
    console.error(err)
  }
}

function toggleOrder(id) {
  openOrderId.value = openOrderId.value === id ? null : id
}

async function lowProducts() {
  const { data, error } = await supabase.rpc('admin_reorder_candidates', { p_low: LOW_STOCK })
  if (!error && Array.isArray(data?.products)) {
    suppliers.value = data.suppliers || []
    return data.products
  }
  return props.fallback
}

async function soldLast30Days() {
  const today = new Date()
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29)
  try {
    return soldByProduct(await listSales({ from }))
  } catch (err) {
    // without the sales the suggestion is just "back to 20"
    console.error(err)
    return new Map()
  }
}

onMounted(async () => {
  loadOrders()
  try {
    const [products, sold] = await Promise.all([lowProducts(), soldLast30Days()])
    groups.value = bySupplier(products, sold).map((group) => ({
      ...group,
      // ticked = in the order; a product already on order starts unticked
      items: group.items.map((item) => ({ ...item, picked: !item.lastOrder })),
      // who gets it: the product's own supplier, or one picked here
      supplierId: group.key === 'none' ? '' : group.key,
      note: '',
      sending: false,
      result: null, // { ok, text }
    }))
  } catch (err) {
    errorMessage.value = err.message || "Couldn't load the low products."
  } finally {
    loading.value = false
  }
})

function fixQty(item) {
  item.qty = Math.min(Math.max(Math.floor(Number(item.qty) || 0), 0), 9999)
}

function lastOrderText(order) {
  if (!order) return ''
  if (order.status === 'accepted') {
    return `On its way · ${count(order.qty)} pcs${order.expected_date ? ` · ${order.expected_date}` : ''}`
  }
  return `Ordered ${dayAndTime(order.at)} · ${count(order.qty)} pcs · waiting for the supplier`
}

// what goes in the order: the ticked products with a quantity
const linesOf = (group) => group.items.filter((item) => item.picked && Number(item.qty) > 0)

const allPicked = (group) => group.items.every((item) => item.picked)

function pickAll(group, on) {
  group.items.forEach((item) => (item.picked = on))
}

const locked = (group) => group.sending || group.result?.ok

async function send(group) {
  if (group.sending || group.result?.ok) return
  const lines = linesOf(group)
  if (!group.supplierId) {
    group.result = { ok: false, text: 'Pick the supplier first.' }
    return
  }
  if (lines.length === 0) {
    group.result = { ok: false, text: 'Tick at least one product, with a quantity above 0.' }
    return
  }

  group.sending = true
  group.result = null
  try {
    const { order, sent, reason } = await sendOrder(
      group.supplierId,
      lines.map((item) => ({ product_id: item.id, qty: Number(item.qty) })),
      group.note.trim()
    )
    group.result = sent
      ? { ok: true, text: `Order #${order.id} sent. It's in the supplier's Orders and was emailed to them.` }
      : { ok: true, text: `Order #${order.id} sent to the supplier's Orders. The email didn't go out: ${String(reason).replace(/[.\s]+$/, '')}. Try again from Orders.` }
    emit('sent', order)
    // the new order shows open in the list below
    await loadOrders()
    openOrderId.value = order.id
  } catch (err) {
    group.result = { ok: false, text: err.message }
  } finally {
    group.sending = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click.self="emit('close')"
      @keydown.esc="emit('close')"
    >
      <div
        class="flex max-h-[90vh] w-full min-w-0 max-w-3xl flex-col rounded-[28px] border border-white/10 bg-zinc-900 p-4 shadow-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reorder-title"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-2.5">
            <h2 id="reorder-title" class="text-2xl font-extrabold text-white">Reorder</h2>
            <span v-if="!loading" class="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-300">
              {{ count(productCount) }}
            </span>
            <HelpTip
              :text="`Products with ${LOW_STOCK} or fewer left, by supplier. The pieces are a suggestion: enough for the last 30 days' sales, and at least ${MIN_AFTER_ORDER} in stock after. Tick the products to order and change any quantity, then send the order: the supplier sees it in their Orders and gets it by email.`"
            />
          </div>
          <button
            class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700"
            aria-label="Close"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <p v-if="errorMessage" class="mb-3 rounded-xl bg-red-600/20 p-3 text-sm text-red-400" role="alert">
          {{ errorMessage }}
        </p>

        <div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <p v-if="loading" class="py-10 text-center text-sm text-zinc-500">Loading…</p>
          <p v-else-if="groups.length === 0" class="py-10 text-center text-sm text-zinc-500">
            Nothing is running low.
          </p>

          <section
            v-for="group in groups"
            :key="group.key"
            class="overflow-hidden rounded-2xl border bg-black/20"
            :class="group.result?.ok ? 'border-emerald-500/40' : 'border-white/10'"
          >
            <header class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate font-bold" :class="group.key === 'none' ? 'italic text-zinc-400' : 'text-white'">
                  {{ group.name }}
                </p>
                <p v-if="group.email" class="truncate text-xs text-zinc-500">{{ group.email }}</p>
              </div>
              <!-- no supplier on these products yet: pick who gets the order -->
              <select
                v-if="group.key === 'none'"
                :id="`reorder-supplier-${group.key}`"
                v-model="group.supplierId"
                class="rounded-lg border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-sm text-white"
                aria-label="Send this order to"
                :disabled="group.sending || group.result?.ok"
              >
                <option value="">Pick the supplier…</option>
                <option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option>
              </select>
            </header>

            <table class="w-full text-sm">
              <thead class="text-left text-[0.68rem] font-bold uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th class="w-10 py-2 pl-4 pr-0">
                    <input
                      type="checkbox"
                      class="pick"
                      :checked="allPicked(group)"
                      :disabled="locked(group)"
                      :aria-label="`Order every product from ${group.name}`"
                      @change="pickAll(group, $event.target.checked)"
                    />
                  </th>
                  <th class="px-3 py-2">Product</th>
                  <th class="px-2 py-2 text-right">Stock</th>
                  <th class="hidden px-2 py-2 text-right sm:table-cell">Sold · 30 days</th>
                  <th class="px-4 py-2 text-right">Order</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in group.items"
                  :key="item.id"
                  class="border-t border-white/5 transition-opacity"
                  :class="item.picked ? '' : 'opacity-45'"
                >
                  <td class="w-10 py-2.5 pl-4 pr-0">
                    <input
                      :id="`reorder-pick-${group.key}-${item.id}`"
                      v-model="item.picked"
                      type="checkbox"
                      class="pick"
                      :disabled="locked(group)"
                      :aria-label="`Order ${item.name}`"
                    />
                  </td>
                  <td class="cursor-pointer px-3 py-2.5" @click="!locked(group) && (item.picked = !item.picked)">
                    <p class="font-semibold text-zinc-100">{{ item.name }}</p>
                    <p v-if="item.lastOrder" class="text-xs text-sky-300">{{ lastOrderText(item.lastOrder) }}</p>
                    <p v-else-if="item.category" class="text-xs text-zinc-500">{{ item.category }}</p>
                  </td>
                  <td class="px-2 py-2.5 text-right font-bold" :class="item.stock <= 0 ? 'text-red-400' : 'text-yellow-300'">
                    {{ count(item.stock) }}
                  </td>
                  <td class="hidden px-2 py-2.5 text-right text-zinc-400 sm:table-cell">{{ count(item.sold) }}</td>
                  <td class="px-4 py-2.5 text-right">
                    <label class="sr-only" :for="`reorder-${group.key}-${item.id}`">Pieces of {{ item.name }} to order</label>
                    <input
                      :id="`reorder-${group.key}-${item.id}`"
                      v-model.number="item.qty"
                      type="number"
                      min="0"
                      max="9999"
                      class="w-20 rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-right text-sm font-bold text-white outline-none focus:border-yellow-400"
                      :disabled="locked(group) || !item.picked"
                      @blur="fixQty(item)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- the note and Send -->
            <footer class="flex flex-wrap items-center gap-2 border-t border-white/5 px-4 py-3">
              <label class="sr-only" :for="`reorder-note-${group.key}`">Note for the supplier</label>
              <input
                :id="`reorder-note-${group.key}`"
                v-model="group.note"
                type="text"
                maxlength="500"
                placeholder="Note for the supplier (optional)"
                class="min-w-0 flex-1 basis-48 rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                :disabled="group.sending || group.result?.ok"
              />
              <button
                type="button"
                class="send-btn"
                :disabled="locked(group) || linesOf(group).length === 0"
                @click="send(group)"
              >
                <NavIcon name="mail" class="h-4 w-4" />
                {{
                  group.sending
                    ? 'Sending…'
                    : group.result?.ok
                      ? 'Sent'
                      : `Send order request (${linesOf(group).length})`
                }}
              </button>
              <p
                v-if="group.result"
                class="w-full rounded-lg px-3 py-2 text-xs font-bold"
                :class="group.result.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-300'"
                role="status"
              >
                {{ group.result.text }}
              </p>
            </footer>
          </section>

          <!-- the orders already sent: each card opens and closes -->
          <section v-if="!loading && orders.length" aria-labelledby="reorder-sent-title" class="space-y-2.5 pt-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 id="reorder-sent-title" class="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-zinc-400">
                <NavIcon name="mail" class="h-4 w-4" />
                {{ showAllOrders ? 'All orders' : 'Open orders' }}
                <span class="rounded-full bg-white/10 px-2 py-0.5 text-xs text-zinc-200">
                  {{ count(shownOrders.length) }}
                </span>
              </h3>
              <button
                v-if="orders.length > openOrders.length"
                type="button"
                class="text-xs font-bold text-zinc-400 hover:text-white"
                @click="showAllOrders = !showAllOrders"
              >
                {{ showAllOrders ? 'Show open only' : `Show all (${orders.length})` }}
              </button>
            </div>
            <p v-if="shownOrders.length === 0" class="rounded-xl bg-black/20 px-4 py-3 text-sm text-zinc-500">
              No open orders right now.
            </p>
            <OrderCard
              v-for="order in shownOrders"
              :key="order.id"
              :order="order"
              :open="openOrderId === order.id"
              @toggle="toggleOrder"
              @changed="loadOrders"
            />
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.send-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.4rem;
  border-radius: 0.65rem;
  background: var(--brand);
  padding: 0.5rem 0.9rem;
  font-size: 0.82rem;
  font-weight: 800;
  color: #fff;
}

.send-btn:hover:not(:disabled) {
  background: var(--brand-bright);
}

.pick {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--brand);
  cursor: pointer;
}

.send-btn:disabled {
  opacity: 0.55;
}
</style>
