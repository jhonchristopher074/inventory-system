<script setup>
// Orders to suppliers (Inventory > Orders, lib/orders.js): what was sent,
// the supplier's answer, and whether the email went out. Cancel while the
// supplier hasn't answered, send the email again when it failed, and mark
// an accepted order completed once the goods are in.
import { computed, onMounted, ref } from 'vue'
import { ORDER_STATES, cancelOrder, completeOrder, listOrders, orderPieces, resendOrderEmail, NOT_SET_UP } from '../lib/orders'
import { count, dayAndTime } from '../lib/format'
import NavIcon from './NavIcon.vue'

const emit = defineEmits(['close'])

const orders = ref([])
const ready = ref(true)
const loading = ref(true)
const message = ref(null) // { ok, text }
const busyId = ref(null)
const view = ref('open') // open | all

const OPEN = ['requested', 'accepted']
const shown = computed(() =>
  view.value === 'open' ? orders.value.filter((order) => OPEN.includes(order.order_status || 'requested')) : orders.value
)
const openCount = computed(() => orders.value.filter((order) => OPEN.includes(order.order_status || 'requested')).length)

async function load() {
  try {
    const result = await listOrders()
    ready.value = result.ready
    orders.value = result.list
  } catch (err) {
    message.value = { ok: false, text: err.message }
  } finally {
    loading.value = false
  }
}

onMounted(load)

function stateOf(order) {
  return ORDER_STATES[order.order_status || 'requested'] || ORDER_STATES.requested
}

// the email, in words
function emailText(order) {
  if (order.status === 'sent') return { text: `Emailed ${order.sent_at ? dayAndTime(order.sent_at) : ''}`, tone: 'text-emerald-400' }
  if (order.status === 'failed') return { text: `Not emailed: ${order.error || 'unknown reason'}`, tone: 'text-red-300' }
  if (order.status === 'to_send') return { text: 'Email waiting to be sent', tone: 'text-zinc-400' }
  return { text: '', tone: '' }
}

async function act(order, what) {
  if (busyId.value) return
  busyId.value = order.id
  message.value = null
  try {
    if (what === 'cancel') {
      await cancelOrder(order.id)
      message.value = { ok: true, text: `Order #${order.id} cancelled.` }
    } else if (what === 'complete') {
      await completeOrder(order.id)
      message.value = { ok: true, text: `Order #${order.id} is completed.` }
    } else if (what === 'email') {
      const { sent, reason } = await resendOrderEmail(order.id)
      message.value = sent
        ? { ok: true, text: `Order #${order.id} was emailed to ${order.supplier_name}.` }
        : { ok: false, text: `Still not emailed: ${reason}` }
    }
    await load()
  } catch (err) {
    message.value = { ok: false, text: err.message }
  } finally {
    busyId.value = null
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
        aria-labelledby="orders-title"
      >
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 id="orders-title" class="text-2xl font-extrabold text-white">Orders to suppliers</h2>
          <button class="shrink-0 rounded-full bg-zinc-800 px-4 py-2 font-bold text-white hover:bg-zinc-700" aria-label="Close" @click="emit('close')">
            ✕
          </button>
        </div>

        <div class="mb-3 flex gap-2" role="group" aria-label="Show orders">
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

        <p
          v-if="message"
          class="mb-3 rounded-xl p-3 text-sm"
          :class="message.ok ? 'bg-emerald-600/15 text-emerald-300' : 'bg-red-600/15 text-red-300'"
          role="status"
        >
          {{ message.text }}
        </p>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <p v-if="loading" class="py-10 text-center text-sm text-zinc-500">Loading…</p>
          <p v-else-if="!ready" class="rounded-xl bg-amber-500/10 p-4 text-sm text-amber-300">{{ NOT_SET_UP }}</p>
          <p v-else-if="shown.length === 0" class="py-10 text-center text-sm text-zinc-500">
            {{ view === 'open' ? 'No open orders. Send one from Low stock > Reorder.' : 'No orders yet.' }}
          </p>

          <article
            v-for="order in shown"
            :key="order.id"
            class="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="font-bold text-white">
                  Order #{{ order.id }} · {{ order.supplier_name }}
                </p>
                <p class="text-xs text-zinc-500">
                  {{ dayAndTime(order.created_at) }}{{ order.created_by_name ? ` · by ${order.created_by_name}` : '' }}
                  · {{ count(orderPieces(order)) }} pcs
                </p>
              </div>
              <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" :class="stateOf(order).tone">
                {{ stateOf(order).label }}
              </span>
            </div>

            <ul class="mt-2 divide-y divide-white/5 rounded-xl border border-white/5">
              <li v-for="(item, i) in order.items" :key="i" class="flex justify-between gap-3 px-3 py-1.5 text-sm">
                <span class="min-w-0 truncate text-zinc-200">{{ item.product_name }}</span>
                <span class="shrink-0 font-bold text-white">{{ count(item.qty) }} pcs</span>
              </li>
            </ul>

            <dl class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
              <template v-if="order.note">
                <dt class="text-zinc-500">Your note</dt>
                <dd class="text-zinc-300">{{ order.note }}</dd>
              </template>
              <template v-if="order.expected_date">
                <dt class="text-zinc-500">Delivery</dt>
                <dd class="font-bold text-emerald-300">{{ order.expected_date }} · on the Calendar</dd>
              </template>
              <template v-if="order.supplier_reply">
                <dt class="text-zinc-500">Supplier says</dt>
                <dd class="text-zinc-300">{{ order.supplier_reply }}</dd>
              </template>
              <template v-if="emailText(order).text">
                <dt class="text-zinc-500">Email</dt>
                <dd :class="emailText(order).tone">{{ emailText(order).text }}</dd>
              </template>
            </dl>

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                v-if="order.order_status === 'requested' && order.status === 'failed'"
                type="button"
                class="act-btn"
                :disabled="busyId === order.id"
                @click="act(order, 'email')"
              >
                <NavIcon name="mail" class="h-3.5 w-3.5" /> Send email again
              </button>
              <button
                v-if="order.order_status === 'accepted'"
                type="button"
                class="act-btn act-good"
                :disabled="busyId === order.id"
                @click="act(order, 'complete')"
              >
                <NavIcon name="check" class="h-3.5 w-3.5" /> Goods are in: mark completed
              </button>
              <button
                v-if="(order.order_status || 'requested') === 'requested'"
                type="button"
                class="act-btn act-bad"
                :disabled="busyId === order.id"
                @click="act(order, 'cancel')"
              >
                Cancel order
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.act-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border-radius: 0.65rem;
  border: 1px solid var(--hairline);
  background: var(--color-zinc-800);
  padding: 0.4rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 700;
  color: #fff;
}

.act-btn:hover:not(:disabled) {
  background: var(--color-zinc-700);
}

.act-btn:disabled {
  opacity: 0.5;
}

.act-good {
  border-color: rgba(52, 211, 153, 0.4);
  color: var(--color-emerald-400);
}

.act-bad {
  border-color: rgba(244, 52, 76, 0.4);
  color: var(--color-red-400);
}
</style>
